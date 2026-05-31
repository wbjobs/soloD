import os
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI = os.getenv('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = os.getenv('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.getenv('NEO4J_PASSWORD', 'password')

NPM_REGISTRY_URL = 'https://registry.npmjs.org'
OSV_API_URL = 'https://api.osv.dev/v1/query'
