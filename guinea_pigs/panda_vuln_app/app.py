#!/usr/bin/env python3
"""
PandaExploit Vulnerable Test Application
========================================
Intentionally vulnerable Flask app for testing the PandaExploit agent.
Contains: SQLi, XSS, Command Injection, Path Traversal, SSRF, LFI.

WARNING: For authorized security testing only. Never deploy in production.
"""

import os
import sqlite3
import subprocess
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from flask import (
    Flask,
    request,
    render_template_string,
    redirect,
    url_for,
    session,
    make_response,
)

app = Flask(__name__)
app.secret_key = "pandaexploit-test-secret-key-change-in-prod"  # Intentionally weak
app.config["SECRET_KEY"] = "another-bad-secret"

# SQLite DB path
DB_PATH = Path(__file__).parent / "data" / "vuln.db"


def init_db():
    """Initialize SQLite database with sample data."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        password TEXT,
        email TEXT,
        role TEXT
    )"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY,
        content TEXT,
        author TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )"""
    )
    # Default credentials (intentionally weak)
    c.execute(
        "INSERT OR IGNORE INTO users VALUES (1, 'admin', 'admin', 'admin@panda.local', 'admin')"
    )
    c.execute(
        "INSERT OR IGNORE INTO users VALUES (2, 'guest', 'guest123', 'guest@test.com', 'user')"
    )
    c.execute(
        "INSERT OR IGNORE INTO comments VALUES (1, 'Welcome to the test app!', 'admin', datetime('now'))"
    )
    conn.commit()
    conn.close()


# Base template with navigation for Katana crawling
BASE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }}</title>
    <meta name="generator" content="Flask 2.3">
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <nav>
        <a href="/">Home</a> |
        <a href="/search?q=test">Search</a> |
        <a href="/ping?host=127.0.0.1">Network Tools</a> |
        <a href="/file?path=readme.txt">File Viewer</a> |
        <a href="/fetch?url=http://example.com">URL Fetcher</a> |
        <a href="/login">Login</a> |
        <a href="/users?id=1">User Lookup</a> |
        <a href="/comments">Comments</a> |
        <a href="/debug">Debug</a> |
        <a href="/admin">Admin</a>
    </nav>
    <main>
        {{ content|safe }}
    </main>
</body>
</html>
"""


def render_page(title, content):
    """Render a page with base template."""
    return render_template_string(BASE_HTML, title=title, content=content)


@app.route("/")
def index():
    """Home page - entry point for crawlers."""
    content = """
        <h1>PandaExploit Test Application</h1>
        <p>Intentionally vulnerable application for security testing.</p>
        <ul>
            <li><a href="/search?q=hello">Search</a> - Try searching</li>
            <li><a href="/ping?host=8.8.8.8">Ping</a> - Network diagnostic</li>
            <li><a href="/file?path=readme.txt">File Viewer</a> - Read files</li>
            <li><a href="/fetch?url=http://example.com">Fetch URL</a> - Fetch external URLs</li>
            <li><a href="/login">Login</a> - User authentication</li>
            <li><a href="/users?id=1">User Lookup</a> - Look up users by ID</li>
            <li><a href="/echo?msg=test">Echo</a> - Echo your message</li>
        </ul>
        <p><a href="/health">Health check</a></p>
        """
    return render_page("Home - Panda Vuln App", content)


@app.route("/health")
def health():
    """Health endpoint for load balancers and recon."""
    return {"status": "ok", "version": "1.0.0"}, 200


# =============================================================================
# SQL INJECTION
# =============================================================================


@app.route("/login", methods=["GET", "POST"])
def login():
    """Vulnerable login - SQL injection in username/password."""
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # VULNERABLE: Direct string concatenation
        query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
        try:
            c.execute(query)
            user = c.fetchone()
            conn.close()
            if user:
                session["user"] = user[1]
                return redirect(url_for("index"))
            return render_page("Login Failed", "<h1>Login Failed</h1><p>Invalid credentials. <a href='/login'>Try again</a></p>")
        except Exception as e:
            conn.close()
            return render_page("Error", f"<h1>Error</h1><p>Database error: {e}</p><a href='/login'>Back</a>")
    return render_page(
        "Login",
        """<h1>Login</h1>
        <form method="POST" action="/login">
            <input type="text" name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>
        <p>Hint: admin/admin or try SQL injection</p>""",
    )


@app.route("/users")
def user_lookup():
    """Vulnerable user lookup - SQL injection in id parameter."""
    user_id = request.args.get("id", "1")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # VULNERABLE: Direct string concatenation
    query = f"SELECT id, username, email, role FROM users WHERE id={user_id}"
    try:
        c.execute(query)
        user = c.fetchone()
        conn.close()
        if user:
            return render_page(
                "User Lookup",
                f"<h1>User: {user[1]}</h1><p>ID: {user[0]}, Email: {user[2]}, Role: {user[3]}</p><a href='/users?id=1'>Back to users</a>",
            )
        return "User not found", 404
    except Exception as e:
        conn.close()
        return render_page("Error", f"<h1>Error</h1><p>{e}</p>"), 500


@app.route("/search")
def search():
    """Vulnerable search - SQL injection and reflected XSS."""
    q = request.args.get("q", "")
    if not q:
        return render_page(
            "Search",
            """<h1>Search</h1>
            <form method="GET" action="/search">
                <input type="text" name="q" placeholder="Search...">
                <button type="submit">Search</button>
            </form>""",
        )
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # VULNERABLE: SQLi + results rendered unsafely
    query = f"SELECT username, email FROM users WHERE username LIKE '%{q}%' OR email LIKE '%{q}%'"
    try:
        c.execute(query)
        results = c.fetchall()
        conn.close()
        items = "".join(f"<li>{r[0]} - {r[1]}</li>" for r in results)
        return render_page(
            "Search Results",
            f'<h1>Search Results for "{q}"</h1>'
            f'<form method="GET" action="/search"><input type="text" name="q" value="{q}"><button type="submit">Search</button></form>'
            f"<ul>{items}</ul>",
        )
    except Exception as e:
        conn.close()
        # VULNERABLE: Error message reflects user input (XSS vector)
        return render_page("Search Error", f"<h1>Search Error</h1><p>Query failed: {e}</p><a href='/search'>Try again</a>"), 500


# =============================================================================
# REFLECTED XSS
# =============================================================================


@app.route("/echo")
def echo():
    """Vulnerable echo - reflected XSS."""
    msg = request.args.get("msg", "No message")
    # VULNERABLE: Direct output without escaping (XSS)
    content = f"""<h1>Echo</h1>
        <p>You said: {msg}</p>
        <form method="GET" action="/echo">
            <input type="text" name="msg" placeholder="Enter message">
            <button type="submit">Echo</button>
        </form>"""
    return render_page("Echo", content)


# =============================================================================
# COMMAND INJECTION
# =============================================================================


@app.route("/ping")
def ping():
    """Vulnerable ping - command injection."""
    host = request.args.get("host", "127.0.0.1")
    # VULNERABLE: User input passed to shell (shell=True enables injection)
    try:
        result = subprocess.run(
            f"ping -c 3 {host}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        output = result.stdout or result.stderr or "No output"
    except subprocess.TimeoutExpired:
        output = "Ping timed out"
    except Exception as e:
        output = str(e)
    content = f"""<h1>Ping Results</h1>
        <form method="GET" action="/ping">
            <input type="text" name="host" value="{host}" placeholder="Host or IP">
            <button type="submit">Ping</button>
        </form>
        <pre>{output}</pre>
        <p><a href="/whois?domain=example.com">Try whois</a></p>"""
    return render_page("Ping", content)


@app.route("/whois")
def whois():
    """Vulnerable whois - command injection."""
    domain = request.args.get("domain", "example.com")
    # VULNERABLE: User input passed to shell (shell=True enables injection)
    try:
        result = subprocess.run(
            f"whois {domain}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = result.stdout or result.stderr or "No output"
    except Exception as e:
        output = str(e)
    content = f"""<h1>Whois Results</h1>
        <form method="GET" action="/whois">
            <input type="text" name="domain" value="{domain}" placeholder="Domain">
            <button type="submit">Lookup</button>
        </form>
        <pre>{output}</pre>"""
    return render_page("Whois", content)


# =============================================================================
# PATH TRAVERSAL
# =============================================================================


@app.route("/file")
def file_read():
    """Vulnerable file viewer - path traversal."""
    path = request.args.get("path", "readme.txt")
    base_dir = Path(__file__).parent / "files"
    base_dir.mkdir(exist_ok=True)
    (base_dir / "readme.txt").write_text("Welcome to Panda Vuln App. Try path traversal: ../../../etc/passwd")
    # VULNERABLE: No path sanitization - allows ../../../etc/passwd
    try:
        if path.startswith("/"):
            file_content = Path(path).read_text(errors="replace")
        else:
            file_content = (base_dir / path).read_text(errors="replace")
    except Exception as e:
        file_content = f"Error: {e}"
    content = f"""<h1>File Viewer</h1>
        <form method="GET" action="/file">
            <input type="text" name="path" value="{path}" placeholder="Filename">
            <button type="submit">Read</button>
        </form>
        <pre>{file_content}</pre>"""
    return render_page("File Viewer", content)


# =============================================================================
# SSRF
# =============================================================================


@app.route("/fetch")
def fetch_url():
    """Vulnerable URL fetcher - SSRF."""
    url = request.args.get("url", "http://example.com")
    # VULNERABLE: Fetches any URL - can access internal services
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PandaVulnApp/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            content = resp.read().decode("utf-8", errors="replace")[:2000]
    except Exception as e:
        content = f"Error fetching URL: {e}"
    body = f"""<h1>URL Fetcher</h1>
        <form method="GET" action="/fetch">
            <input type="text" name="url" value="{url}" placeholder="URL to fetch">
            <button type="submit">Fetch</button>
        </form>
        <pre>{content}</pre>"""
    return render_page("URL Fetcher", body)


# =============================================================================
# STORED XSS
# =============================================================================


@app.route("/comments", methods=["GET", "POST"])
def comments():
    """Vulnerable comments - stored XSS."""
    if request.method == "POST":
        content = request.form.get("content", "")
        author = request.form.get("author", "anonymous")
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # VULNERABLE: Stored without sanitization
        c.execute("INSERT INTO comments (content, author) VALUES (?, ?)", (content, author))
        conn.commit()
        conn.close()
        return redirect(url_for("comments"))
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT content, author, created_at FROM comments ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    # VULNERABLE: Rendered without escaping (stored XSS)
    comments_html = "".join(
        f'<div class="comment"><strong>{r[1]}</strong>: {r[0]} <em>{r[2]}</em></div>'
        for r in rows
    )
    content = f"""<h1>Comments</h1>
        <form method="POST" action="/comments">
            <input type="text" name="author" placeholder="Your name">
            <textarea name="content" placeholder="Comment"></textarea>
            <button type="submit">Post</button>
        </form>
        <div class="comments">{comments_html}</div>"""
    return render_page("Comments", content)


# =============================================================================
# SENSITIVE EXPOSURE
# =============================================================================


@app.route("/debug")
def debug():
    """Exposed debug endpoint - information disclosure."""
    return {
        "debug": True,
        "flask_version": "2.3.0",
        "python": "3.11",
        "env": dict(os.environ),
        "secret_key": app.secret_key[:20] + "...",
    }


@app.route("/admin")
def admin():
    """Admin panel - default credentials."""
    return render_page(
        "Admin",
        "<h1>Admin Panel</h1><p>Default credentials: admin / admin</p><a href='/admin/api-keys'>API Keys</a>",
    )


@app.route("/admin/api-keys")
def api_keys():
    """Exposed API keys - sensitive data exposure."""
    # Intentionally fake keys for testing (placeholders only - do not use real keys)
    keys = {
        "AWS_ACCESS_KEY": "AKIAIOSFODNN7EXAMPLE",
        "AWS_SECRET_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "STRIPE_SECRET": "[placeholder-stripe-key]",
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    }
    return keys


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
