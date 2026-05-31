from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from ik_solver import IKSolver
from trajectory_planner import TrajectoryPlanner
from database import init_db, save_record, get_recent_records, get_record_by_id
import time
import os

app = Flask(__name__)
CORS(app)

ik_solver = IKSolver()
trajectory_planner = TrajectoryPlanner()

init_db()

last_request_time = 0
MIN_REQUEST_INTERVAL = 0.1


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)


@app.route('/api/solve-ik', methods=['POST'])
def solve_ik():
    global last_request_time
    
    try:
        current_time = time.time()
        if current_time - last_request_time < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL * 0.5)
        last_request_time = current_time
        
        data = request.json
        target_x = float(data.get('x', 0))
        target_y = float(data.get('y', 0))
        target_z = float(data.get('z', 0))
        
        result = ik_solver.solve(target_x, target_y, target_z)
        
        try:
            save_record(target_x, target_y, target_z, result)
        except Exception as e:
            app.logger.warning(f"Failed to save record: {e}")
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'服务器错误: {str(e)}'
        }), 500


@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        limit = request.args.get('limit', 50, type=int)
        records = get_recent_records(limit)
        return jsonify(records)
    except Exception as e:
        return jsonify([])


@app.route('/api/history/<int:record_id>', methods=['GET'])
def get_history_record(record_id):
    try:
        record = get_record_by_id(record_id)
        if record:
            return jsonify(record)
        return jsonify({'error': 'Record not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/plan-trajectory', methods=['POST'])
def plan_trajectory():
    try:
        data = request.json
        waypoints = data.get('waypoints', [])
        duration = data.get('duration', 2.0)
        samples = data.get('samples', 50)
        method = data.get('method', 'quintic')
        
        if len(waypoints) < 2:
            return jsonify({
                'success': False,
                'message': '至少需要2个目标点'
            })
        
        for point in waypoints:
            if len(point) != 3:
                return jsonify({
                    'success': False,
                    'message': '每个目标点需要包含x, y, z三个坐标'
                })
        
        if method == 'linear':
            result = trajectory_planner.linear_interpolation_trajectory(
                waypoints, duration, samples
            )
        else:
            result = trajectory_planner.plan_trajectory(
                waypoints, duration, samples
            )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'轨迹规划失败: {str(e)}'
        }), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)
