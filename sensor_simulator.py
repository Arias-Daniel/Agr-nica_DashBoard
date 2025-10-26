import requests
import random
import time
import json

# URL del endpoint de ingesta de nuestra API Flask
API_INGEST_URL = "https://solartrace-api.onrender.com/api/data/ingest"

# Identificadores de los 3 nodos de sensores
SENSOR_IDS = ["Referencia", "Cama_1", "Cama_2"]

def generate_mock_data(sensor_id):
    """
    Crea un diccionario con datos de sensor aleatorios pero realistas.
    Los valores simulan las lecturas de los diferentes canales de luz.
    """
    # Simula una lectura base, con variaciones para cada sensor
    base_lux = 1000
    if sensor_id == "Referencia":
        base_lux = random.randint(1800, 2200) # El de referencia recibe más luz
    elif sensor_id == "Cama_1":
        base_lux = random.randint(1200, 1500)
    else: # Cama_2
        base_lux = random.randint(1100, 1400)
        
    data = {
        "sensor_id": sensor_id,
        "ch_415": int(base_lux * random.uniform(0.1, 0.2)), # Violeta
        "ch_440": int(base_lux * random.uniform(0.2, 0.3)),
        "ch_485": int(base_lux * random.uniform(0.4, 0.5)),
        "ch_515": int(base_lux * random.uniform(0.8, 1.0)), # Verde (pico de sensibilidad)
        "ch_555": int(base_lux * random.uniform(0.7, 0.9)),
        "ch_590": int(base_lux * random.uniform(0.5, 0.6)),
        "ch_610": int(base_lux * random.uniform(0.4, 0.5)), # Naranja/Rojo
        "ch_680": int(base_lux * random.uniform(0.3, 0.4)), # Rojo profundo
        "ch_730": int(base_lux * random.uniform(0.1, 0.2)),
        "ch_760": int(base_lux * random.uniform(0.05, 0.1)),
        "ch_860": int(base_lux * random.uniform(0.01, 0.05)),
        "ch_clear": int(base_lux * random.uniform(1.8, 2.2)),
    }
    
    # Calcula un total_lux simple sumando algunos canales clave
    data["total_lux"] = data["ch_515"] + data["ch_610"] + data["ch_680"]
    
    return data

def send_data(data):
    """
    Envía los datos generados al endpoint de la API usando una petición POST.
    """
    try:
        headers = {'Content-Type': 'application/json'}
        response = requests.post(API_INGEST_URL, data=json.dumps(data), headers=headers)
        response.raise_for_status()  # Lanza un error si la respuesta es 4xx o 5xx
        print(f"Éxito: {response.json()['message']}")
    except requests.exceptions.RequestException as e:
        print(f"Error al enviar datos para {data['sensor_id']}: {e}")

if __name__ == "__main__":
    print("Iniciando simulador de sensores SOLARTRACE...")
    print(f"Enviando datos a: {API_INGEST_URL}")
    
    # Bucle infinito para enviar datos continuamente
    while True:
        # Itera sobre cada sensor y envía sus datos
        for sensor in SENSOR_IDS:
            mock_data = generate_mock_data(sensor)
            send_data(mock_data)
        
        # Espera un intervalo antes de la siguiente ronda de envíos
        interval = 10 # segundos
        print(f"\n--- Esperando {interval} segundos para la próxima lectura ---\n")
        time.sleep(interval)
