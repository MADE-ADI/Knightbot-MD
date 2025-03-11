from flask import Flask, jsonify, request, render_template, redirect, url_for, Response
import requests

app = Flask(__name__)


@app.route('/')
def index():
    return redirect(url_for('manage'))

@app.route('/list-bots')
def list_bots():
    try:
        # Make a request to the Node.js API
        response = requests.get('http://localhost:3000/list-bots')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/add-new', methods=['POST'])
def connect():
    try:
        # Get session details from request
        data = request.get_json()
        
        if not data or 'sessionName' not in data:
            return jsonify({'success': False, 'error': 'Session name is required'}), 400
        
        # Make a request to the Node.js API
        response = requests.post(
            'http://localhost:3000/start-bot', 
            json=data,
            headers={'Content-Type': 'application/json'}
        )
        
        # Return the response from the Node.js server
        return jsonify(response.json()), response.status_code
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/bot-action', methods=['POST'])
def bot_action():
    try:
        # Get action details from request
        data = request.get_json()
        
        if not data or 'action' not in data or 'botName' not in data:
            return jsonify({'success': False, 'error': 'Action and bot name are required'}), 400
        
        # Make a request to the Node.js API
        response = requests.post(
            'http://localhost:3000/bot-action', 
            json=data,
            headers={'Content-Type': 'application/json'}
        )
        
        # Return the response from the Node.js server
        return jsonify(response.json()), response.status_code
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/qrcodes/<path:filename>')
def serve_qrcode(filename):
    try:
        response = requests.get(f'http://localhost:3000/qrcodes/{filename}', stream=True)
        return Response(response.iter_content(chunk_size=1024), 
                       content_type=response.headers['Content-Type'])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/manage')
def manage():
    return render_template('manage.html')


if __name__ == '__main__':
    app.run(debug=True)