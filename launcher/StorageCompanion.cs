using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace InsertechEvenements
{
    // Sauvegarde persistante SQLite du PC principal.
    // L'interface (dans Edge/Chrome) envoie l'état complet de sa base à ce petit serveur, qui l'écrit dans
    // %LOCALAPPDATA%\InsertechEvenements\insertech.db. Il n'écoute que sur 127.0.0.1 : le pare-feu Windows
    // ne filtre pas cette boucle locale, aucun droit administrateur n'est nécessaire. Une clé aléatoire,
    // passée dans l'adresse de la page, empêche tout autre site ouvert sur le PC de lire ou d'écrire.
    sealed class StorageCompanion : IDisposable
    {
        static readonly string[] Tables = { "events", "tickets", "technicians", "participants", "attendees" };
        const int PreferredPort = 47615;
        const int MaxBodyBytes = 64 * 1024 * 1024;

        readonly string dbPath;
        readonly object dbLock = new object();
        TcpListener listener;
        public int Port { get; private set; }
        public string Token { get; private set; }
        long lastRequestTicks = DateTime.UtcNow.Ticks;

        public StorageCompanion(string appDataDir)
        {
            dbPath = Path.Combine(appDataDir, "insertech.db");
        }

        public TimeSpan IdleFor => DateTime.UtcNow - new DateTime(Interlocked.Read(ref lastRequestTicks), DateTimeKind.Utc);

        public void Start()
        {
            SQLitePCL.Batteries_V2.Init();
            InitDatabase();
            BackupOnStart();

            Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
            for (int port = PreferredPort; port < PreferredPort + 10 && listener == null; port++)
            {
                try
                {
                    var l = new TcpListener(IPAddress.Loopback, port);
                    l.Start();
                    listener = l;
                }
                catch (SocketException) { }
            }
            if (listener == null)
            {
                listener = new TcpListener(IPAddress.Loopback, 0);
                listener.Start();
            }
            Port = ((IPEndPoint)listener.LocalEndpoint).Port;
            Task.Run(AcceptLoop);
        }

        SqliteConnection Open()
        {
            var c = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = dbPath }.ToString());
            c.Open();
            return c;
        }

        void InitDatabase()
        {
            using var c = Open();
            using var cmd = c.CreateCommand();
            cmd.CommandText =
                "PRAGMA journal_mode=WAL;" +
                "CREATE TABLE IF NOT EXISTS records (tbl TEXT NOT NULL, id TEXT NOT NULL, event_id TEXT, json TEXT NOT NULL, PRIMARY KEY (tbl, id));" +
                "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);";
            cmd.ExecuteNonQuery();
        }

        // Une copie de la base à chaque lancement (10 gardées) : un mauvais enregistrement reste rattrapable
        void BackupOnStart()
        {
            try
            {
                string dir = Path.Combine(Path.GetDirectoryName(dbPath), "sauvegardes-sqlite");
                Directory.CreateDirectory(dir);
                using (var src = Open())
                using (var dst = new SqliteConnection($"Data Source={Path.Combine(dir, $"insertech-{DateTime.Now:yyyyMMdd-HHmmss}.db")}"))
                {
                    dst.Open();
                    src.BackupDatabase(dst);
                }
                var files = new List<string>(Directory.GetFiles(dir, "insertech-*.db"));
                files.Sort(StringComparer.Ordinal);
                for (int i = 0; i < files.Count - 10; i++) File.Delete(files[i]);
            }
            catch
            {
                // La sauvegarde de lancement est un filet de plus, jamais bloquante
            }
        }

        async Task AcceptLoop()
        {
            while (true)
            {
                TcpClient client;
                try { client = await listener.AcceptTcpClientAsync(); }
                catch { return; }
                _ = Task.Run(() => Handle(client));
            }
        }

        async Task Handle(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 15000;
                    var stream = client.GetStream();
                    var (method, target, headers, body) = await ReadRequest(stream);
                    if (method == null) return;
                    Interlocked.Exchange(ref lastRequestTicks, DateTime.UtcNow.Ticks);

                    if (method == "OPTIONS")
                    {
                        await Write(stream, 204, "");
                        return;
                    }

                    string path = target, query = "";
                    int q = target.IndexOf('?');
                    if (q >= 0) { path = target.Substring(0, q); query = target.Substring(q + 1); }
                    if (!TokenMatches(query))
                    {
                        await Write(stream, 403, "{\"ok\":false,\"error\":\"cle\"}");
                        return;
                    }

                    if (path == "/ping" && method == "GET")
                        await Write(stream, 200, "{\"ok\":true,\"backend\":\"sqlite\",\"path\":" + JsonSerializer.Serialize(dbPath, AppJson.Default.String) + "}");
                    else if (path == "/snapshot" && method == "GET")
                        await Write(stream, 200, LoadSnapshot());
                    else if (path == "/snapshot" && method == "POST")
                    {
                        var (status, json) = SaveSnapshot(body);
                        await Write(stream, status, json);
                    }
                    else
                        await Write(stream, 404, "{\"ok\":false}");
                }
                catch
                {
                    // Connexion interrompue : la page réessaiera
                }
            }
        }

        bool TokenMatches(string query)
        {
            foreach (var part in query.Split('&'))
            {
                if (part.StartsWith("cle=", StringComparison.Ordinal))
                {
                    var given = Encoding.UTF8.GetBytes(Uri.UnescapeDataString(part.Substring(4)));
                    var expected = Encoding.UTF8.GetBytes(Token);
                    return CryptographicOperations.FixedTimeEquals(given, expected);
                }
            }
            return false;
        }

        static async Task<(string, string, Dictionary<string, string>, byte[])> ReadRequest(NetworkStream stream)
        {
            var buffer = new MemoryStream();
            var chunk = new byte[8192];
            int headerEnd = -1;
            while (headerEnd < 0)
            {
                int n = await stream.ReadAsync(chunk, 0, chunk.Length);
                if (n <= 0) return (null, null, null, null);
                buffer.Write(chunk, 0, n);
                headerEnd = IndexOfHeaderEnd(buffer.GetBuffer(), (int)buffer.Length);
                if (buffer.Length > 65536 && headerEnd < 0) return (null, null, null, null);
            }
            var raw = buffer.GetBuffer();
            string head = Encoding.ASCII.GetString(raw, 0, headerEnd);
            var lines = head.Split("\r\n");
            var first = lines[0].Split(' ');
            if (first.Length < 2) return (null, null, null, null);
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 1; i < lines.Length; i++)
            {
                int c = lines[i].IndexOf(':');
                if (c > 0) headers[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
            }
            int length = 0;
            if (headers.TryGetValue("Content-Length", out var cl)) int.TryParse(cl, out length);
            if (length < 0 || length > MaxBodyBytes) return (null, null, null, null);
            var body = new byte[length];
            int already = (int)buffer.Length - (headerEnd + 4);
            Array.Copy(raw, headerEnd + 4, body, 0, Math.Min(already, length));
            int read = Math.Min(already, length);
            while (read < length)
            {
                int n = await stream.ReadAsync(body, read, length - read);
                if (n <= 0) break;
                read += n;
            }
            return (first[0], first[1], headers, body);
        }

        static int IndexOfHeaderEnd(byte[] b, int len)
        {
            for (int i = 3; i < len; i++)
                if (b[i - 3] == '\r' && b[i - 2] == '\n' && b[i - 1] == '\r' && b[i] == '\n') return i - 3;
            return -1;
        }

        static async Task Write(NetworkStream stream, int status, string json)
        {
            var body = Encoding.UTF8.GetBytes(json);
            string reason = status == 200 ? "OK" : status == 204 ? "No Content" : "Error";
            var head =
                $"HTTP/1.1 {status} {reason}\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type\r\n" +
                "Access-Control-Allow-Private-Network: true\r\n" +
                "Cache-Control: no-store\r\n" +
                $"Content-Length: {body.Length}\r\n" +
                "Connection: close\r\n\r\n";
            var h = Encoding.ASCII.GetBytes(head);
            await stream.WriteAsync(h, 0, h.Length);
            await stream.WriteAsync(body, 0, body.Length);
        }

        // Remplace tout le contenu par l'état envoyé par la page, en une seule transaction
        (int, string) SaveSnapshot(byte[] body)
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (!root.TryGetProperty("tables", out var tables) || tables.ValueKind != JsonValueKind.Object)
                return (400, "{\"ok\":false,\"error\":\"format\"}");
            bool allowEmpty = root.TryGetProperty("allowEmpty", out var ae) && ae.ValueKind == JsonValueKind.True;
            long savedAt = root.TryGetProperty("savedAt", out var sa) && sa.TryGetInt64(out var v) ? v : 0;

            int incomingEvents = tables.TryGetProperty("events", out var ev) && ev.ValueKind == JsonValueKind.Array ? ev.GetArrayLength() : 0;

            lock (dbLock)
            {
                using var c = Open();
                // Une page dont la base a été effacée ne doit jamais écraser une sauvegarde qui contient des activités
                if (incomingEvents == 0 && !allowEmpty)
                {
                    using var count = c.CreateCommand();
                    count.CommandText = "SELECT COUNT(*) FROM records WHERE tbl = 'events'";
                    if (Convert.ToInt64(count.ExecuteScalar()) > 0)
                        return (409, "{\"ok\":false,\"error\":\"vide\"}");
                }

                using var tx = c.BeginTransaction();
                using (var del = c.CreateCommand())
                {
                    del.Transaction = tx;
                    del.CommandText = "DELETE FROM records";
                    del.ExecuteNonQuery();
                }
                using var ins = c.CreateCommand();
                ins.Transaction = tx;
                ins.CommandText = "INSERT OR REPLACE INTO records (tbl, id, event_id, json) VALUES ($t, $id, $e, $j)";
                var pt = ins.Parameters.Add("$t", SqliteType.Text);
                var pid = ins.Parameters.Add("$id", SqliteType.Text);
                var pe = ins.Parameters.Add("$e", SqliteType.Text);
                var pj = ins.Parameters.Add("$j", SqliteType.Text);
                int rows = 0;
                foreach (var table in Tables)
                {
                    if (!tables.TryGetProperty(table, out var arr) || arr.ValueKind != JsonValueKind.Array) continue;
                    foreach (var row in arr.EnumerateArray())
                    {
                        if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty("id", out var idEl)) continue;
                        pt.Value = table;
                        pid.Value = idEl.ValueKind == JsonValueKind.String ? idEl.GetString() : idEl.GetRawText();
                        pe.Value = table == "events"
                            ? pid.Value
                            : row.TryGetProperty("eventId", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : (object)DBNull.Value;
                        pj.Value = row.GetRawText();
                        ins.ExecuteNonQuery();
                        rows++;
                    }
                }
                using (var meta = c.CreateCommand())
                {
                    meta.Transaction = tx;
                    meta.CommandText = "INSERT OR REPLACE INTO meta (key, value) VALUES ('savedAt', $v)";
                    meta.Parameters.AddWithValue("$v", savedAt.ToString());
                    meta.ExecuteNonQuery();
                }
                tx.Commit();
                return (200, "{\"ok\":true,\"rows\":" + rows + "}");
            }
        }

        string LoadSnapshot()
        {
            lock (dbLock)
            {
                using var c = Open();
                var sb = new StringBuilder("{\"savedAt\":");
                using (var meta = c.CreateCommand())
                {
                    meta.CommandText = "SELECT value FROM meta WHERE key = 'savedAt'";
                    var savedAt = meta.ExecuteScalar() as string;
                    sb.Append(long.TryParse(savedAt, out var s) ? s : 0);
                }
                sb.Append(",\"tables\":{");
                for (int i = 0; i < Tables.Length; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append('"').Append(Tables[i]).Append("\":[");
                    using var cmd = c.CreateCommand();
                    cmd.CommandText = "SELECT json FROM records WHERE tbl = $t";
                    cmd.Parameters.AddWithValue("$t", Tables[i]);
                    using var r = cmd.ExecuteReader();
                    bool first = true;
                    while (r.Read())
                    {
                        if (!first) sb.Append(',');
                        sb.Append(r.GetString(0));
                        first = false;
                    }
                    sb.Append(']');
                }
                sb.Append("}}");
                return sb.ToString();
            }
        }

        public void Dispose()
        {
            try { listener?.Stop(); } catch { }
        }
    }

    [System.Text.Json.Serialization.JsonSerializable(typeof(string))]
    partial class AppJson : System.Text.Json.Serialization.JsonSerializerContext { }
}
