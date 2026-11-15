using System;
using System.IO;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

internal static class WorkBaseVaultHost
{
    // This ID is derived from browser-extension/manifest.json's public key.
    private const string Origin = "chrome-extension://edmdkkenmmjjmigelcbogbbnnjjndggd/";

    private static int Main(string[] args)
    {
        if (args.Length == 0 || args[0] != Origin) return 1;
        using (var input = new BinaryReader(Console.OpenStandardInput()))
        using (var output = new BinaryWriter(Console.OpenStandardOutput()))
        {
            try
            {
                var request = ReadFrame(input, 32768);
                var token = File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "session.bin"));
                if (token.Length != 32) throw new IOException();
                using (var hash = SHA256.Create())
                {
                    var name = "WorkBaseVault-" + BitConverter.ToString(hash.ComputeHash(token), 0, 16)
                        .Replace("-", "").ToLowerInvariant();
                    using (var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut,
                        PipeOptions.None, TokenImpersonationLevel.Identification))
                    {
                        pipe.Connect(800);
                        var writer = new BinaryWriter(pipe);
                        writer.Write(token);
                        WriteFrame(writer, request);
                        WriteFrame(output, ReadFrame(new BinaryReader(pipe), 1048576));
                    }
                }
            }
            catch (Exception)
            {
                WriteFrame(output, Encoding.UTF8.GetBytes("{\"ok\":false,\"code\":\"VAULT_OFFLINE\"}"));
            }
        }
        return 0;
    }

    private static byte[] ReadFrame(BinaryReader reader, int max)
    {
        var length = reader.ReadInt32();
        if (length < 1 || length > max) throw new IOException();
        var bytes = reader.ReadBytes(length);
        if (bytes.Length != length) throw new EndOfStreamException();
        return bytes;
    }

    private static void WriteFrame(BinaryWriter writer, byte[] bytes)
    {
        writer.Write(bytes.Length);
        writer.Write(bytes);
        writer.Flush();
    }
}
