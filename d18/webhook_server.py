from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

@app.route('/webhook/alerts', methods=['POST'])
def alert_webhook():
    alert_data = request.get_json()
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    print(f"\n{'='*60}")
    print(f"🚨 ALERT RECEIVED - {timestamp}")
    print(f"{'='*60}")
    print(f"Alert Type: {alert_data.get('type', 'Unknown')}")
    print(f"Error Count: {alert_data.get('error_count', 0)}")
    print(f"Threshold: {alert_data.get('threshold', 0)}")
    print(f"Time Window: {alert_data.get('time_window', 'N/A')}")
    print(f"Top Services: {alert_data.get('top_services', [])}")
    print(f"Message: {alert_data.get('message', '')}")
    print(f"{'='*60}\n")
    
    return jsonify({
        "status": "received",
        "timestamp": timestamp,
        "alert_id": hash(str(alert_data)) % 100000
    }), 200

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    print("Webhook Alert Server starting...")
    print("Listening on http://localhost:8080")
    print("Endpoint: POST /webhook/alerts")
    print("Press Ctrl+C to stop...\n")
    app.run(host='0.0.0.0', port=8080, debug=False)
