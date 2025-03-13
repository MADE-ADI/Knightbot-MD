from flask import Flask, jsonify, request, render_template, redirect, url_for, Response
import requests
import subprocess
import os
import threading

app = Flask(__name__)

def run_bot_process(session_name):
    """Fungsi untuk menjalankan bot sebagai proses terpisah"""
    try:
        # Pastikan path ke backupi.js sesuai
        bot_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backupi.js')
        
        # Jalankan bot dengan subprocess
        process = subprocess.Popen(
            ['node', bot_path, '--run', session_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Log output (opsional)
        for line in process.stdout:
            print(f"[Bot {session_name}] {line.strip()}")
            
    except Exception as e:
        print(f"Error menjalankan bot {session_name}: {str(e)}")

@app.route('/')
def index():
    return redirect(url_for('manage'))

@app.route('/list-bots')
def list_bots():
    try:
        # Make a request to the Node.js API
        response = requests.get('http://localhost:8083/list-bots')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/add-new', methods=['POST'])
def connect():
    try:
        data = request.get_json()
        
        if not data or 'sessionName' not in data:
            return jsonify({'success': False, 'error': 'Session name is required'}), 400
        
        session_name = data['sessionName']
        
        # Jalankan bot dalam thread terpisah
        bot_thread = threading.Thread(
            target=run_bot_process,
            args=(session_name,),
            daemon=True
        )
        bot_thread.start()
        
        return jsonify({
            'success': True,
            'message': f'Bot {session_name} sedang dijalankan',
            'botId': session_name
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/bot-action', methods=['POST'])
def bot_action():
    try:
        data = request.get_json()
        
        if not data or 'action' not in data or 'botName' not in data:
            return jsonify({'success': False, 'error': 'Action and bot name are required'}), 400
        
        action = data['action']
        bot_name = data['botName']
        
        if action == 'start':
            # Jalankan bot dalam thread terpisah
            bot_thread = threading.Thread(
                target=run_bot_process,
                args=(bot_name,),
                daemon=True
            )
            bot_thread.start()
            return jsonify({'success': True, 'message': f'Bot {bot_name} sedang dijalankan'})
            
        elif action == 'stop':
            # Implementasi stop bot (perlu ditambahkan)
            # Bisa menggunakan subprocess.run(['pkill', '-f', f'node.*{bot_name}'])
            return jsonify({'success': True, 'message': f'Bot {bot_name} dihentikan'})
            
        elif action == 'delete':
            # Implementasi delete bot (perlu ditambahkan)
            bot_session_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'bot-sessions', bot_name)
            if os.path.exists(bot_session_path):
                import shutil
                shutil.rmtree(bot_session_path)
            return jsonify({'success': True, 'message': f'Bot {bot_name} dihapus'})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/qrcodes/<path:filename>')
def serve_qrcode(filename):
    try:
        response = requests.get(f'http://localhost:8083/qrcodes/{filename}', stream=True)
        return Response(response.iter_content(chunk_size=1024), 
                       content_type=response.headers['Content-Type'])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/manage')
def manage():
    return render_template('manage.html')

@app.route('/check-connection/<bot_id>')
def check_connection(bot_id):
    try:
        response = requests.get(f'http://localhost:8083/check-connection/{bot_id}')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/wait-connection/<bot_id>')
def wait_connection(bot_id):
    try:
        response = requests.get(f'http://localhost:8083/wait-connection/{bot_id}', timeout=35)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/update-owner/<bot_id>', methods=['POST'])
def update_owner(bot_id):
    try:
        data = request.get_json()
        if not data or 'ownerNumber' not in data:
            return jsonify({'success': False, 'error': 'Owner number is required'}), 400
        
        response = requests.post(
            f'http://localhost:8083/update-owner/{bot_id}',
            json=data,
            headers={'Content-Type': 'application/json'}
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/new-run-session/<session_name>')
def new_run_session(session_name):
    def generate():
        try:
            # Subscribe ke updates dari Node.js server
            response = requests.get(
                f'http://localhost:8083/session-updates/{session_name}',
                stream=True
            )
            
            for line in response.iter_lines():
                if line:
                    yield f"data: {line.decode()}\n\n"
                    
        except Exception as e:
            yield f"data: {{'error': '{str(e)}'}}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5001)