from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os

from database import db
from npm_scraper import scraper
from cve_checker import cve_checker

app = Flask(__name__, static_folder='static')
CORS(app)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/scrape', methods=['POST'])
def scrape_package():
    data = request.json
    package_name = data.get('package_name')
    package_version = data.get('version')
    max_depth = data.get('max_depth', 3)

    if not package_name:
        return jsonify({'error': 'package_name is required'}), 400

    try:
        scraper.reset()
        
        if db.package_exists(package_name, package_version or 'latest'):
            return jsonify({
                'message': 'Package already exists in database',
                'package_name': package_name,
                'version': package_version
            })

        dependencies = scraper.scrape_dependencies(
            package_name, 
            package_version,
            max_depth=max_depth
        )

        packages_to_check = []
        for pkg in dependencies:
            packages_to_check.append({
                'name': pkg['name'],
                'version': pkg['version']
            })
        
        vulnerability_results = cve_checker.batch_check_vulnerabilities(packages_to_check)

        for pkg in dependencies:
            pkg_key = f"{pkg['name']}@{pkg['version']}"
            vuln_info = vulnerability_results.get(pkg_key, {})
            has_vuln = vuln_info.get('has_vulnerability', False)
            vulns = vuln_info.get('vulnerabilities', []) if has_vuln else []
            db.create_package_node(pkg['name'], pkg['version'], has_vuln, vulns)

        for pkg in dependencies:
            for dep_name, dep_version_range in pkg['dependencies'].items():
                dep_info = next((d for d in dependencies if d['name'] == dep_name), None)
                if dep_info:
                    db.create_dependency_relationship(
                        pkg['name'], pkg['version'],
                        dep_name, dep_info['version'],
                        dep_version_range
                    )

        return jsonify({
            'message': 'Package scraped successfully',
            'package_name': package_name,
            'version': package_version,
            'packages_processed': len(dependencies)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/graph/<package_name>/<package_version>', methods=['GET'])
def get_graph(package_name, package_version):
    try:
        max_level = request.args.get('max_level', 2, type=int)
        graph_data = db.get_package_graph(package_name, package_version, max_level)
        return jsonify(graph_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dependencies/<package_name>/<package_version>', methods=['GET'])
def get_dependencies(package_name, package_version):
    try:
        deps_data = db.get_direct_dependencies(package_name, package_version)
        return jsonify(deps_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vulnerability/<package_name>/<package_version>', methods=['GET'])
def get_vulnerability(package_name, package_version):
    try:
        result = cve_checker.check_vulnerability(package_name, package_version)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/package/<package_name>/<version>', methods=['GET'])
def get_package_info(package_name, version):
    try:
        info = scraper.get_package_info(package_name, version)
        if not info:
            return jsonify({'error': 'Package not found'}), 404
        
        return jsonify({
            'name': info.get('name'),
            'version': info.get('version'),
            'description': info.get('description', ''),
            'author': info.get('author', {}).get('name', '') if isinstance(info.get('author'), dict) else info.get('author', ''),
            'license': info.get('license', ''),
            'homepage': info.get('homepage', ''),
            'repository': info.get('repository', {}).get('url', '') if isinstance(info.get('repository'), dict) else info.get('repository', ''),
            'dependencies': info.get('dependencies', {}),
            'devDependencies': info.get('devDependencies', {})
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clear', methods=['POST'])
def clear_database():
    try:
        db.clear_database()
        return jsonify({'message': 'Database cleared successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/propagation-path', methods=['POST'])
def get_propagation_path():
    try:
        data = request.json
        root_name = data.get('root_name')
        root_version = data.get('root_version')
        vuln_id = data.get('vuln_id')

        if not root_name or not vuln_id:
            return jsonify({'error': 'root_name and vuln_id are required'}), 400

        if not root_version:
            root_version = 'latest'

        path_data = db.find_shortest_propagation_path(root_name, root_version, vuln_id)
        return jsonify(path_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vulnerabilities-in-graph', methods=['GET'])
def get_vulnerabilities_in_graph():
    try:
        package_name = request.args.get('package_name')
        package_version = request.args.get('package_version', 'latest')
        max_level = request.args.get('max_level', 10, type=int)

        if not package_name:
            return jsonify({'error': 'package_name is required'}), 400

        graph_data = db.get_package_graph(package_name, package_version, max_level)
        
        all_vulns = []
        for node in graph_data['nodes']:
            if node.get('has_vulnerability'):
                vulns = db.get_all_vulnerabilities(node['name'], node['version'])
                for vuln in vulns:
                    all_vulns.append({
                        **vuln,
                        'package_name': node['name'],
                        'package_version': node['version']
                    })

        return jsonify({'vulnerabilities': all_vulns})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)
