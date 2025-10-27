import os
from pathlib import Path 
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse, Response

# --- Configuración Inicial ---

# ¡NUEVO! Definir rutas absolutas
# __file__ es la ubicación de app.py
APP_DIR = Path(__file__).parent 
# BASE_DIR es la raíz del proyecto (un nivel arriba de backend/)
BASE_DIR = APP_DIR.parent
# PUBLIC_DIR es la carpeta public
PUBLIC_DIR = BASE_DIR / "public"

# Cargar variables de entorno desde la raíz del proyecto
load_dotenv(BASE_DIR / ".env")

# Crear la aplicación FastAPI
app = FastAPI(
    title="SolarTrace API",
    description="API para el análisis espectral en tiempo real del invernadero.",
    version="1.0.0"
)

# Configurar Supabase
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# ... (resto de la configuración de supabase) ...

# --- Montar el Frontend (Archivos Estáticos y Templates) ---

# ¡CORREGIDO! Usar la ruta absoluta a 'public'
app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")

# ¡CORREGIDO! Usar la ruta absoluta a 'public'
templates = Jinja2Templates(directory=PUBLIC_DIR)

@app.get("/", include_in_schema=False)
async def serve_index(request: Request):
    """Sirve la página principal del dashboard."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.head("/", include_in_schema=False)
async def serve_index_head():
    """Responde a los pings 'HEAD' de los monitores de uptime."""
    return Response(status_code=200, media_type="text/html")
# --- FIN DE LA NUEVA FUNCIÓN ---

@app.get("/api/data/current")
async def get_current_data():
    """
    Obtiene la última lectura de CADA uno de los 3 sensores.
    """
    sensor_ids = ['Referencia', 'Cama_1', 'Cama_2']
    data = {}

    try:
        for sensor_id in sensor_ids:
            # Obtener la última fila para este sensor_id
            response = supabase.table('sensor_readings') \
                               .select('*') \
                               .eq('sensor_id', sensor_id) \
                               .order('created_at', desc=True) \
                               .limit(1) \
                               .execute()

            if response.data:
                data[sensor_id] = response.data[0]
            else:
                data[sensor_id] = None # Sensor no encontrado o sin datos

        return data
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/data/historical")
async def get_historical_data(range_days: int = 1):
    """
    Obtiene datos históricos para un rango de días.
    'range_days=1' significa "Hoy".
    'range_days=7' significa "Últimos 7 días".
    """
    try:
        # Calcular la fecha de inicio
        if range_days <= 1:
            # "Hoy" significa desde la medianoche de hoy
            start_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            # "Últimos X días"
            start_time = datetime.now() - timedelta(days=range_days)
        
        # Convertir a formato de string ISO 8601 para Supabase
        start_time_iso = start_time.isoformat()

        # Consultar todos los datos desde la fecha de inicio
        response = supabase.table('sensor_readings') \
                           .select('created_at, sensor_id, ppfd_total, ch_680, ch_730') \
                           .gte('created_at', start_time_iso) \
                           .order('created_at', asc=True) \
                           .execute()

        if not response.data:
            return JSONResponse(status_code=404, content={"error": "No data found for this range"})

        # Reorganizar los datos por sensor_id para el frontend
        grouped_data = {'Referencia': [], 'Cama_1': [], 'Cama_2': []}
        for reading in response.data:
            sensor_id = reading.get('sensor_id')
            if sensor_id in grouped_data:
                grouped_data[sensor_id].append(reading)

        return grouped_data

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/data/summary")
async def get_summary_data(range_days: int = 1):
    """
    Calcula métricas clave (DLI, R:FR promedio) para un rango de días.
    """
    try:
        # 1. Obtener los datos históricos (reutilizando la función anterior)
        historical_data = await get_historical_data(range_days)
        if isinstance(historical_data, JSONResponse): # Manejar error si no hay datos
             return JSONResponse(status_code=404, content={"error": "No data to summarize"})

        summary = {}

        for sensor_id, readings in historical_data.items():
            if not readings:
                summary[sensor_id] = {'dli': 0, 'avg_rfr': 0}
                continue
            
            # 2. Calcular DLI (Daily Light Integral)
            # DLI es la integral de PPFD sobre el día, en mol·m⁻²·día⁻¹
            # Usamos la regla del trapecio para la integración numérica.
            
            total_integral = 0.0 # en μmol·m⁻²
            total_rfr = 0.0
            rfr_count = 0
            
            # Ordenar por tiempo para asegurar la integración correcta
            readings.sort(key=lambda x: x['created_at'])

            for i in range(len(readings) - 1):
                # Datos para DLI
                t1 = datetime.fromisoformat(readings[i]['created_at'])
                t2 = datetime.fromisoformat(readings[i+1]['created_at'])
                ppfd1 = readings[i].get('ppfd_total', 0)
                ppfd2 = readings[i+1].get('ppfd_total', 0)
                
                # Tiempo transcurrido en SEGUNDOS
                delta_t = (t2 - t1).total_seconds()
                
                # Área del trapecio: (y1 + y2) / 2 * delta_x
                trapezoid_area = ((ppfd1 + ppfd2) / 2) * delta_t
                total_integral += trapezoid_area

                # Datos para R:FR
                ch_680 = readings[i].get('ch_680', 0)
                ch_730 = readings[i].get('ch_730', 0)
                if ch_730 > 0: # Evitar división por cero
                    total_rfr += (ch_680 / ch_730)
                    rfr_count += 1
            
            # Convertir integral total de μmol a mol (dividir por 1,000,000)
            dli = total_integral / 1_000_000
            
            # Calcular R:FR promedio
            avg_rfr = (total_rfr / rfr_count) if rfr_count > 0 else 0
            
            summary[sensor_id] = {
                'dli': round(dli, 2),
                'avg_rfr': round(avg_rfr, 2)
            }

        return summary
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# --- Ejecución del Servidor ---
if __name__ == "__main__":
    import uvicorn
    # Ejecutar en localhost, puerto 8000
    # En producción, usarías un servidor Gunicorn + Uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)