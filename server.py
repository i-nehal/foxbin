import http.server
import json
import sqlite3
import os
import urllib.parse
import secrets
import sys

DB_FILE = 'foxbin.db'
ADMIN_USER = 'admin'
ADMIN_PASS = 'Nehal123'
SESSION_TOKEN = secrets.token_hex(16)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Create pastes table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pastes (
            id TEXT PRIMARY KEY,
            alias TEXT UNIQUE,
            code TEXT UNIQUE,
            title TEXT,
            content TEXT,
            language TEXT,
            visibility TEXT,
            expiration TEXT,
            created_at INTEGER
        )
    ''')
    # Create config table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    conn.commit()
    conn.close()

class APIRoutingHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    # Helper to send JSON response with proper Content-Length to prevent connection drop alerts
    def send_json(self, data, status=200):
        try:
            response_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        except Exception as e:
            print(f"Error sending JSON: {e}")
            sys.stdout.flush()

    def check_admin_auth(self):
        auth_header = self.headers.get('Authorization')
        if not auth_header:
            return False
        parts = auth_header.split(' ')
        if len(parts) == 2 and parts[0] == 'Bearer':
            return parts[1] == SESSION_TOKEN
        return False

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        try:
            # API: Get Ad Script
            if path_parts == ['api', 'ad']:
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("SELECT value FROM config WHERE key = 'ad_code'")
                row = cursor.fetchone()
                ad_code = row[0] if row else ""
                conn.close()
                self.send_json({'ad_code': ad_code})
                return

            # API: Get Statistics
            elif path_parts == ['api', 'stats']:
                if not self.check_admin_auth():
                    self.send_json({'error': 'Unauthorized'}, 401)
                    return
                    
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                cursor.execute("SELECT COUNT(*) FROM pastes")
                total = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM pastes WHERE visibility = 'public'")
                public_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT language, COUNT(*) as cnt FROM pastes GROUP BY language ORDER BY cnt DESC")
                langs = [{'language': r[0], 'count': r[1]} for r in cursor.fetchall()]
                
                db_size_kb = 0
                if os.path.exists(DB_FILE):
                    db_size_kb = round(os.path.getsize(DB_FILE) / 1024, 2)
                    
                conn.close()
                self.send_json({
                    'total_pastes': total,
                    'public_pastes': public_count,
                    'private_pastes': total - public_count,
                    'db_size': f"{db_size_kb} KB",
                    'languages': langs
                })
                return

            # API: List Public Pastes
            elif path_parts == ['api', 'pastes']:
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("SELECT id, alias, code, title, content, language, visibility, expiration, created_at FROM pastes WHERE visibility = 'public' ORDER BY created_at DESC")
                rows = cursor.fetchall()
                conn.close()
                
                pastes = []
                for r in rows:
                    pastes.append({
                        'id': r[0], 'alias': r[1], 'code': r[2], 'title': r[3],
                        'content': r[4], 'language': r[5], 'visibility': r[6],
                        'expiration': r[7], 'createdAt': r[8]
                    })
                self.send_json(pastes)
                return

            # API: Get Specific Paste
            elif len(path_parts) == 3 and path_parts[0:2] == ['api', 'pastes']:
                identifier = path_parts[2]
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, alias, code, title, content, language, visibility, expiration, created_at FROM pastes WHERE id = ? OR alias = ? OR UPPER(code) = UPPER(?)",
                    (identifier, identifier, identifier)
                )
                r = cursor.fetchone()
                conn.close()
                
                if r:
                    self.send_json({
                        'id': r[0], 'alias': r[1], 'code': r[2], 'title': r[3],
                        'content': r[4], 'language': r[5], 'visibility': r[6],
                        'expiration': r[7], 'createdAt': r[8]
                    })
                else:
                    self.send_json({'error': 'Not Found'}, 404)
                return
        except Exception as e:
            print(f"GET exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

        # Serve SPA static files
        filename = parsed_url.path.lstrip('/')
        if not filename:
            filename = 'index.html'
            
        if os.path.exists(filename) and os.path.isfile(filename):
            return super().do_GET()
        else:
            self.path = '/index.html'
            return super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        # Read JSON body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            body = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            self.send_json({'error': 'Invalid JSON body'}, 400)
            return

        try:
            # API: Login
            if path_parts == ['api', 'login']:
                username = body.get('username')
                password = body.get('password')
                
                if username == ADMIN_USER and password == ADMIN_PASS:
                    self.send_json({'token': SESSION_TOKEN})
                else:
                    self.send_json({'error': 'Invalid credentials'}, 401)
                return

            # API: Save Ad Script
            elif path_parts == ['api', 'ad']:
                if not self.check_admin_auth():
                    self.send_json({'error': 'Unauthorized'}, 401)
                    return
                    
                ad_code = body.get('ad_code', '')
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('ad_code', ?)", (ad_code,))
                conn.commit()
                conn.close()
                self.send_json({'success': True})
                return

            # API: Create Paste
            elif path_parts == ['api', 'pastes']:
                pid = body.get('id')
                alias = body.get('alias')
                code = body.get('code')
                title = body.get('title')
                content = body.get('content')
                language = body.get('language')
                visibility = body.get('visibility')
                expiration = body.get('expiration')
                created_at = body.get('createdAt')
                
                if not pid:
                    self.send_json({'error': 'Paste ID is required'}, 400)
                    return

                # Check duplicate alias
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                if alias:
                    cursor.execute("SELECT id FROM pastes WHERE alias = ? OR id = ?", (alias, alias))
                    if cursor.fetchone():
                        conn.close()
                        self.send_json({'error': 'Alias is already taken'}, 400)
                        return
                
                try:
                    cursor.execute(
                        "INSERT INTO pastes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (pid, alias, code, title, content, language, visibility, expiration, created_at)
                    )
                    conn.commit()
                except sqlite3.IntegrityError as ie:
                    conn.close()
                    # Handle duplicate custom alias or ID conflict
                    self.send_json({'error': f"Conflict error: {str(ie)}"}, 409)
                    return
                except Exception as db_err:
                    conn.close()
                    self.send_json({'error': f"Database write error: {str(db_err)}"}, 500)
                    return
                
                conn.close()
                self.send_json({'success': True, 'id': pid}, 201)
                return
        except Exception as e:
            print(f"POST exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        try:
            # API: Update Paste
            if len(path_parts) == 3 and path_parts[0:2] == ['api', 'pastes']:
                pid = path_parts[2]
                content_length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(content_length).decode('utf-8'))
                content = body.get('content')
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("UPDATE pastes SET content = ?, created_at = ? WHERE id = ?", (content, int(body.get('createdAt', 0)), pid))
                conn.commit()
                conn.close()
                self.send_json({'success': True})
                return
        except Exception as e:
            print(f"PUT exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        try:
            # API: Delete Paste
            if len(path_parts) == 3 and path_parts[0:2] == ['api', 'pastes']:
                pid = path_parts[2]
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("DELETE FROM pastes WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
                self.send_json({'success': True})
                return
        except Exception as e:
            print(f"DELETE exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 8080))
    server_address = ('0.0.0.0', port)
    httpd = http.server.HTTPServer(server_address, APIRoutingHandler)
    print(f"Serving FoxBin API and frontend on port {port}...")
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
