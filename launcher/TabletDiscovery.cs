using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace InsertechEvenements
{
    // Recherche des tablettes Insertech sur le réseau local, par des connexions SORTANTES seulement :
    // le pare-feu Windows ne demande rien et aucun droit administrateur n'est nécessaire.
    // Pour chaque réseau IPv4 actif du PC (avec passerelle), le /24 qui contient le PC est balayé sur les
    // ports 47630 à 47632 ; chaque port ouvert donne sa fiche publique par ws://ip:port/decouverte.
    // La page lit le résultat sur 127.0.0.1 (/tablettes) et appelle elle-même les tablettes de sa session.
    sealed class TabletDiscovery : IDisposable
    {
        static readonly int[] Ports = { 47630, 47631, 47632 };
        const int Parallel = 64;
        static readonly TimeSpan ConnectTimeout = TimeSpan.FromMilliseconds(400);
        static readonly TimeSpan FullSweepEvery = TimeSpan.FromSeconds(10);
        static readonly TimeSpan KnownCheckEvery = TimeSpan.FromSeconds(2);
        static readonly TimeSpan StopWhenUnusedFor = TimeSpan.FromSeconds(60);
        static readonly TimeSpan ForgetAfter = TimeSpan.FromSeconds(30);

        public sealed class Tablet
        {
            public string Ip = "";
            public int Port;
            public string Name = "";
            public string Model = "";
            public string Session; // null : tablette sans session
            public long VersionCode;
            public DateTime SeenAt;
        }

        public sealed class Network
        {
            public string Name = "";
            public string Address = "";
            public string Prefix = "";
        }

        readonly ConcurrentDictionary<string, Tablet> tablets = new ConcurrentDictionary<string, Tablet>();
        volatile List<Network> networks = new List<Network>();
        readonly object startLock = new object();
        CancellationTokenSource cts;
        long lastUseTicks = DateTime.UtcNow.Ticks;

        // Appelé à chaque lecture de /tablettes : la recherche ne tourne que si la page s'en sert
        public void Touch()
        {
            Interlocked.Exchange(ref lastUseTicks, DateTime.UtcNow.Ticks);
            lock (startLock)
            {
                if (cts != null) return;
                cts = new CancellationTokenSource();
                var token = cts.Token;
                Task.Run(() => Loop(token));
            }
        }

        TimeSpan UnusedFor => DateTime.UtcNow - new DateTime(Interlocked.Read(ref lastUseTicks), DateTimeKind.Utc);

        async Task Loop(CancellationToken token)
        {
            var lastFull = DateTime.MinValue;
            try
            {
                while (!token.IsCancellationRequested)
                {
                    if (UnusedFor > StopWhenUnusedFor) break;
                    networks = FindNetworks();
                    if (DateTime.UtcNow - lastFull >= FullSweepEvery)
                    {
                        lastFull = DateTime.UtcNow;
                        await FullSweep(token);
                    }
                    else
                    {
                        await CheckKnown(token);
                    }
                    foreach (var pair in tablets)
                        if (DateTime.UtcNow - pair.Value.SeenAt > ForgetAfter) tablets.TryRemove(pair.Key, out _);
                    await Task.Delay(KnownCheckEvery, token);
                }
            }
            catch (OperationCanceledException) { }
            catch { }
            finally
            {
                lock (startLock) { cts = null; }
            }
        }

        // Interfaces actives, hors boucle locale, avec une passerelle IPv4 (le hotspot)
        static List<Network> FindNetworks()
        {
            var list = new List<Network>();
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback || ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                    var props = ni.GetIPProperties();
                    bool hasGateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
                    if (!hasGateway) continue;
                    foreach (var ua in props.UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily != AddressFamily.InterNetwork || IPAddress.IsLoopback(ua.Address)) continue;
                        var b = ua.Address.GetAddressBytes();
                        if (b[0] == 169 && b[1] == 254) continue; // adresse automatique sans réseau
                        list.Add(new Network
                        {
                            Name = ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? "Wi-Fi" : ni.Name,
                            Address = ua.Address.ToString(),
                            Prefix = $"{b[0]}.{b[1]}.{b[2]}.0"
                        });
                    }
                }
            }
            catch { }
            return list;
        }

        async Task FullSweep(CancellationToken token)
        {
            var targets = new List<(string ip, int port)>();
            foreach (var net in networks)
            {
                var b = IPAddress.Parse(net.Address).GetAddressBytes();
                for (int last = 1; last < 255; last++)
                {
                    if (last == b[3]) continue; // le PC lui-même
                    string ip = $"{b[0]}.{b[1]}.{b[2]}.{last}";
                    foreach (var port in Ports) targets.Add((ip, port));
                }
            }
            await ProbeAll(targets, token);
        }

        async Task CheckKnown(CancellationToken token)
        {
            var targets = tablets.Values.Select(t => (t.Ip, t.Port)).ToList();
            await ProbeAll(targets, token);
        }

        async Task ProbeAll(List<(string ip, int port)> targets, CancellationToken token)
        {
            using var gate = new SemaphoreSlim(Parallel);
            var tasks = new List<Task>();
            foreach (var target in targets)
            {
                await gate.WaitAsync(token);
                tasks.Add(Task.Run(async () =>
                {
                    try { await Probe(target.ip, target.port, token); }
                    finally { gate.Release(); }
                }, token));
            }
            try { await Task.WhenAll(tasks); } catch { }
        }

        async Task Probe(string ip, int port, CancellationToken token)
        {
            // 1. Port ouvert ? (connexion TCP sortante, 400 ms au plus)
            using (var tcp = new TcpClient())
            {
                try
                {
                    var connect = tcp.ConnectAsync(ip, port);
                    if (await Task.WhenAny(connect, Task.Delay(ConnectTimeout, token)) != connect || !tcp.Connected) return;
                }
                catch { return; }
            }

            // 2. Fiche publique de la tablette
            try
            {
                using var ws = new ClientWebSocket();
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                timeout.CancelAfter(TimeSpan.FromSeconds(2));
                await ws.ConnectAsync(new Uri($"ws://{ip}:{port}/decouverte"), timeout.Token);
                var buffer = new byte[4096];
                using var ms = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    ms.Write(buffer, 0, result.Count);
                    if (ms.Length > 16384) return;
                } while (!result.EndOfMessage);
                if (ms.Length == 0) return;

                using var doc = JsonDocument.Parse(ms.ToArray());
                var root = doc.RootElement;
                if (!root.TryGetProperty("app", out var app) || app.GetString() != "insertech") return;
                var tablet = new Tablet
                {
                    Ip = ip,
                    Port = port,
                    Name = Str(root, "nom"),
                    Model = Str(root, "modele"),
                    Session = root.TryGetProperty("session", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null,
                    VersionCode = root.TryGetProperty("versionCode", out var v) && v.TryGetInt64(out var vc) ? vc : 0,
                    SeenAt = DateTime.UtcNow
                };
                tablets[$"{ip}:{port}"] = tablet;
                try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None); } catch { }
            }
            catch { }
        }

        static string Str(JsonElement root, string name) =>
            root.TryGetProperty(name, out var e) && e.ValueKind == JsonValueKind.String ? (e.GetString() ?? "") : "";

        // { reseaux: [...], tablettes: [...] }, écrit à la main (exécutable allégé : pas de sérialisation par réflexion)
        public string ToJson()
        {
            using var ms = new MemoryStream();
            using (var w = new Utf8JsonWriter(ms))
            {
                w.WriteStartObject();
                w.WriteStartArray("reseaux");
                foreach (var n in networks)
                {
                    w.WriteStartObject();
                    w.WriteString("nom", n.Name);
                    w.WriteString("adresse", n.Address);
                    w.WriteString("prefixe", n.Prefix);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteStartArray("tablettes");
                foreach (var t in tablets.Values.OrderBy(t => t.Ip, StringComparer.Ordinal))
                {
                    w.WriteStartObject();
                    w.WriteString("ip", t.Ip);
                    w.WriteNumber("port", t.Port);
                    w.WriteString("nom", t.Name);
                    w.WriteString("modele", t.Model);
                    if (t.Session == null) w.WriteNull("session"); else w.WriteString("session", t.Session);
                    w.WriteNumber("versionCode", t.VersionCode);
                    w.WriteNumber("vuA", new DateTimeOffset(t.SeenAt).ToUnixTimeMilliseconds());
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }

        public void Dispose()
        {
            lock (startLock)
            {
                try { cts?.Cancel(); } catch { }
            }
        }
    }
}
