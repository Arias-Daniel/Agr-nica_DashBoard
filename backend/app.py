import os
from flask import Flask, jsonify, request
from supabase import create_client, Client
from dotenv import load_dotenv
from flask_cors import CORS # Importar CORS

load_dotenv()

app = Flask(__name__)
CORS(app) # Habilitar CORS para toda la aplicación

# --- Conexión con Supabase ---
try:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    supabase: Client = create_client(url, key)
    print("Conexión con Supabase establecida exitosamente.")
except Exception as e:
    print(f"Error al conectar con Supabase: {e}")

# --- Rutas de la API ---

@app.route('/api/data/ingest', methods=['POST'])
def ingest_data():
    data = request.get_json()
    try:
        # No incluimos 'timestamp' porque la DB lo genera automáticamente
        insert_data = {
            "sensor_id": data.get("sensor_id"),
            "ch_415": data.get("ch_415"), "ch_440": data.get("ch_440"),
            "ch_485": data.get("ch_485"), "ch_515": data.get("ch_515"),
            "ch_555": data.get("ch_555"), "ch_590": data.get("ch_590"),
            "ch_610": data.get("ch_610"), "ch_680": data.get("ch_680"),
            "ch_730": data.get("ch_730"), "ch_760": data.get("ch_760"),
            "ch_860": data.get("ch_860"), "ch_clear": data.get("ch_clear"),
            "total_lux": data.get("total_lux")
        }
        response = supabase.table('sensor_readings').insert(insert_data).execute()
        return jsonify({"message": f"Éxito: Datos recibidos del sensor {data.get('sensor_id')}"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/data/current', methods=['GET'])
def get_current_data():
    try:
        # Llamamos a la función que creamos en la base de datos
        response = supabase.rpc('get_latest_readings').execute()
        
        # Procesamos los datos para que tengan el formato {sensor_id: {datos}}
        formatted_data = {}
        for row in response.data:
            sensor_id = row.get('sensor_id')
            formatted_data[sensor_id] = row
            
        return jsonify(formatted_data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
# --- Ruta de Verificación (Health Check) ---
@app.route('/')
def index():
    return "API de SOLARTRACE está en funcionamiento."

# Nota: El bloque if __name__ == '__main__': no es necesario
# porque Gunicorn se encargará de ejecutar la aplicación.

