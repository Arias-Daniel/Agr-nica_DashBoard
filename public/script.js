document.addEventListener('DOMContentLoaded', () => {

    // --- ESTADO GLOBAL Y CONFIGURACIÓN ---
    let state = {
        view: 'live', // 'live', 'today', '7days'
        updateIntervalId: null,
        charts: {},
    };

    const API_URLS = {
        live: '/api/data/current',
        summary_today: '/api/data/summary?range_days=1',
        summary_7days: '/api/data/summary?range_days=7',
        historical_today: '/api/data/historical?range_days=1',
        historical_7days: '/api/data/historical?range_days=7',
    };
    const LIVE_UPDATE_INTERVAL = 5000; // 5 segundos

    const SPECTRAL_LABELS = [
        '415nm', '440nm', '485nm', '515nm', '555nm', '590nm',
        '610nm', '680nm', '730nm', '760nm', '860nm', 'Clear'
    ];
    
    const DATA_KEYS = [
        'ch_415', 'ch_440', 'ch_485', 'ch_515', 'ch_555', 'ch_590',
        'ch_610', 'ch_680', 'ch_730', 'ch_760', 'ch_860', 'ch_clear'
    ];

    // Mapeo de IDs de canvas a IDs de sensores de la API
    const SENSOR_MAPPING = {
        'Referencia': { canvasId: 'referenceChart', prefix: 'ref', color: 'rgba(54, 162, 235, 0.7)' },
        'Cama_1': { canvasId: 'bed1Chart', prefix: 'bed1', color: 'rgba(75, 192, 192, 0.7)' },
        'Cama_2': { canvasId: 'bed2Chart', prefix: 'bed2', color: 'rgba(255, 206, 86, 0.7)' }
    };

    // --- INICIALIZACIÓN ---
    
    function init() {
        // Crear gráficos principales (inicialmente vacíos, tipo 'bar')
        for (const sensorId in SENSOR_MAPPING) {
            const { canvasId, color } = SENSOR_MAPPING[sensorId];
            createChart(sensorId, canvasId, 'bar', `Espectro ${sensorId}`, color);
        }
        
        // Crear gráfico de transmisión
        initTransmissionChart();

        // Configurar botones de rango de tiempo
        document.getElementById('btn-live').addEventListener('click', () => setView('live'));
        document.getElementById('btn-today').addEventListener('click', () => setView('today'));
        document.getElementById('btn-7days').addEventListener('click', () => setView('7days'));

        // Carga inicial
        setView('live');
    }

    // --- MANEJO DE VISTAS (ESTADO) ---

    function setView(newView) {
        if (state.view === newView) return; // No hacer nada si la vista es la misma
        state.view = newView;

        // Detener actualizaciones en vivo si no estamos en 'live'
        if (state.updateIntervalId) {
            clearInterval(state.updateIntervalId);
            state.updateIntervalId = null;
        }

        // Actualizar estilos de botones
        document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`btn-${newView}`).classList.add('active');

        // Limpiar métricas
        resetMetrics();

        // Lanzar la actualización
        updateDashboard();
    }

    // --- LÓGICA DE ACTUALIZACIÓN PRINCIPAL ---

    async function updateDashboard() {
         try {
             if (state.view === 'live') {
                 await fetchAndDisplayLiveData(); // Intenta la primera carga
            } else {
                 // Vistas 'today' o '7days'
                 const rangeKey = state.view; 
                await Promise.all([
                    fetchAndDisplayHistoricalData(API_URLS[`historical_${rangeKey}`]),
                    fetchAndDisplaySummaryData(API_URLS[`summary_${rangeKey}`])
                 ]);
             }
    } catch (error) {
            console.error("Error al actualizar el dashboard:", error);
         } finally {
            // ¡NUEVO! Este bloque se ejecuta SIEMPRE (con éxito o con error)
            // Nos aseguramos de que el intervalo se inicie si estamos en 'live'.
             if (state.view === 'live' && !state.updateIntervalId) {
                 state.updateIntervalId = setInterval(fetchAndDisplayLiveData, LIVE_UPDATE_INTERVAL);
             }
         }
     }

    // --- FUNCIONES DE OBTENCIÓN Y VISUALIZACIÓN ---

    /**
     * Vista "En Vivo": Obtiene y muestra los datos más recientes.
     */
    async function fetchAndDisplayLiveData() {
        
        try {

            const response = await fetch(API_URLS.live);
            if (!response.ok) throw new Error(`Error en API (live): ${response.statusText}`);
            const data = await response.json();

            const transmissionData = { bed1: [], bed2: [] };
            const refData = data['Referencia'] ? DATA_KEYS.map(key => data['Referencia'][key] || 0) : [];

            for (const sensorId in SENSOR_MAPPING) {
                const sensorData = data[sensorId];
                const { prefix, canvasId, color } = SENSOR_MAPPING[sensorId];

                if (sensorData) {
                    // 1. Asegurar que el gráfico es tipo 'bar' (Espectro)
                    recreateChartIfNeeded(sensorId, canvasId, 'bar', `Espectro ${sensorId}`, color);
                    
                    // 2. Extraer datos del espectro
                    const spectralData = DATA_KEYS.map(key => sensorData[key] || 0);
                    state.charts[sensorId].data.labels = SPECTRAL_LABELS;
                    state.charts[sensorId].data.datasets[0].data = spectralData;
                    state.charts[sensorId].options.scales.x.type = 'category'; // Eje X categórico
                    state.charts[sensorId].update();
                    updateChartTitles(prefix, `Espectro de ${sensorId} (En Vivo)`, `Canales del sensor AS7341.`);


                    // 3. Actualizar Métricas Biológicas
                    const ppfd = sensorData.ppfd_total || 0;
                    const rfr = (sensorData.ch_730 > 0) ? (sensorData.ch_680 / sensorData.ch_730).toFixed(2) : 'N/A';
                    updateMetricsUI(prefix, ppfd.toFixed(0), '---', rfr);

                    // 4. Actualizar Heatmap
                    updateHeatmap(prefix, sensorData.total_lux || 0);

                    // 5. Preparar datos de transmisión (vs Referencia)
                    if (sensorId !== 'Referencia' && refData.length > 0) {
                        const tData = spectralData.map((val, i) => {
                            const refVal = refData[i];
                            return (refVal > 0) ? ((val / refVal) * 100).toFixed(1) : 0;
                        });
                        if (sensorId === 'Cama_1') transmissionData.bed1 = tData;
                        if (sensorId === 'Cama_2') transmissionData.bed2 = tData;
                    }
                }
            }
            // 6. Actualizar gráfico de transmisión
            updateTransmissionChart(transmissionData.bed1, transmissionData.bed2);
        
    } catch (error) { // <--- ¡AÑADIR ESTE CATCH!
            console.error("Error en el ciclo 'En Vivo', reintentando en 5s:", error);
            // No hacemos 'throw' para que el setInterval siga intentándolo.
        }
    }   
            
    /**
     * Vista "Histórica": Obtiene y muestra PPFD a lo largo del tiempo.
     */
    async function fetchAndDisplayHistoricalData(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error en API (historical): ${response.statusText}`);
        const groupedData = await response.json();

        for (const sensorId in SENSOR_MAPPING) {
            const readings = groupedData[sensorId];
            const { prefix, canvasId, color } = SENSOR_MAPPING[sensorId];

            if (readings && readings.length > 0) {
                // 1. Asegurar que el gráfico es tipo 'line' (Historial)
                recreateChartIfNeeded(sensorId, canvasId, 'line', `Historial PPFD ${sensorId}`, color);

                // 2. Formatear datos para el gráfico (tiempo, valor)
                const chartData = readings.map(r => ({
                    x: new Date(r.created_at), // Eje X como objeto Date
                    y: r.ppfd_total || 0
                }));
                
                state.charts[sensorId].data.labels = null; // No usamos labels categóricos
                state.charts[sensorId].data.datasets[0].data = chartData;
                state.charts[sensorId].options.scales.x.type = 'time'; // Eje X de tiempo
                state.charts[sensorId].update();

                const rangeText = (state.view === 'today') ? "de Hoy" : "de 7 Días";
                updateChartTitles(prefix, `Historial PPFD de ${sensorId} (${rangeText})`, `Evolución de μmol·m⁻²·s⁻¹.`);

            } else {
                // No hay datos, limpiar gráfico
                state.charts[sensorId].data.datasets[0].data = [];
                state.charts[sensorId].update();
            }
        }
    }

    /**
     * Vista "Histórica": Obtiene y muestra DLI y R:FR promedio.
     */
    async function fetchAndDisplaySummaryData(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error en API (summary): ${response.statusText}`);
        const summaryData = await response.json();

        for (const sensorId in summaryData) {
            const { prefix } = SENSOR_MAPPING[sensorId];
            const { dli, avg_rfr } = summaryData[sensorId];
            
            // Actualizar solo métricas DLI y RFR (PPFD es '---')
            updateMetricsUI(prefix, '---', dli.toFixed(2), avg_rfr.toFixed(2));
        }
    }


    // --- FUNCIONES DE UTILIDAD (Gráficos) ---

    /**
     * Configuración base para un gráfico de espectro (barras).
     */
    const getBarChartConfig = (label, color) => ({
        type: 'bar',
        data: {
            labels: SPECTRAL_LABELS,
            datasets: [{
                label: label,
                data: [],
                backgroundColor: color.replace('0.7', '0.6'),
                borderColor: color.replace('0.7', '1'),
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#d1d9e6' } },
                x: { type: 'category', grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    /**
     * Configuración base para un gráfico histórico (línea).
     */
    const getLineChartConfig = (label, color) => ({
        type: 'line',
        data: {
            datasets: [{
                label: label,
                data: [], // Formato: {x: time, y: value}
                backgroundColor: color.replace('0.7', '0.3'),
                borderColor: color.replace('0.7', '1'),
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'PPFD (μmol·m⁻²·s⁻¹)' }, grid: { color: '#d1d9e6' } },
                x: {
                    type: 'time', // Eje de tiempo
                    time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
                    grid: { display: false },
                    title: { display: true, text: 'Hora del Día' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });

    /**
     * Crea un nuevo gráfico y lo guarda en el estado.
     */
    function createChart(sensorId, canvasId, type, label, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const config = (type === 'bar') 
            ? getBarChartConfig(label, color) 
            : getLineChartConfig(label, color);
        state.charts[sensorId] = new Chart(ctx, config);
    }

    /**
     * Comprueba si un gráfico necesita cambiar de tipo (ej. bar -> line) y lo recrea.
     */
    function recreateChartIfNeeded(sensorId, canvasId, newType, label, color) {
        const chart = state.charts[sensorId];
        if (chart.config.type !== newType) {
            chart.destroy();
            createChart(sensorId, canvasId, newType, label, color);
        } else {
            // El tipo es el mismo, solo actualizar etiqueta
            chart.data.datasets[0].label = label;
        }
    }

    /**
     * Inicializa el gráfico de transmisión.
     */
    function initTransmissionChart() {
        const ctx = document.getElementById('transmissionChart').getContext('2d');
        state.charts['transmission'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: SPECTRAL_LABELS.slice(0, -1), // Excluir 'Clear'
                datasets: [
                    {
                        label: 'Cama 1 vs Referencia',
                        data: [],
                        borderColor: SENSOR_MAPPING['Cama_1'].color,
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                    },
                    {
                        label: 'Cama 2 vs Referencia',
                        data: [],
                        borderColor: SENSOR_MAPPING['Cama_2'].color,
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 110, title: { display: true, text: 'Transmisión (%)' }, grid: { color: '#d1d9e6' } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { display: true, position: 'top' } }
            }
        });
    }

    /**
     * Actualiza el gráfico de transmisión con nuevos datos.
     */
    function updateTransmissionChart(bed1Data, bed2Data) {
        const chart = state.charts['transmission'];
        chart.data.datasets[0].data = bed1Data;
        chart.data.datasets[1].data = bed2Data;
        chart.update();
    }


    // --- FUNCIONES DE UTILIDAD (UI) ---

    /**
     * Actualiza los textos de las métricas clave.
     */
    function updateMetricsUI(prefix, ppfd, dli, rfr) {
        document.getElementById(`metric-ppfd-${prefix}`).textContent = ppfd;
        document.getElementById(`metric-dli-${prefix}`).textContent = dli;
        document.getElementById(`metric-rfr-${prefix}`).textContent = rfr;
    }

    /**
     * Limpia todas las métricas, usualmente al cambiar de vista.
     */
    function resetMetrics() {
        ['ref', 'bed1', 'bed2'].forEach(prefix => {
            updateMetricsUI(prefix, '---', '---', '---');
        });
    }

    /**
     * Actualiza el color del heatmap basado en Lux.
     */
    function updateHeatmap(prefix, lux) {
        const el = document.getElementById(`heatmap-${prefix}`);
        if (el) el.style.backgroundColor = mapLuxToColor(lux);
    }

    /**
     * Actualiza los títulos y subtítulos de los gráficos.
     */
    function updateChartTitles(prefix, title, subtitle) {
        document.getElementById(`chart-title-${prefix}`).textContent = title;
        document.getElementById(`chart-subtitle-${prefix}`).textContent = subtitle;
    }

    /**
     * Mapea un valor de Lux a un color HSL (de azul frío a amarillo cálido).
     */
    function mapLuxToColor(lux, minLux = 0, maxLux = 2000) { // Rango aumentado
        if (lux === null || lux === undefined || lux < minLux) return '#a3b1c6'; // Gris por defecto
        const ratio = Math.min(Math.max(lux - minLux, 0) / (maxLux - minLux), 1);
        
        // Interpolar de azul (hsl(210, 80%, 60%)) a amarillo (hsl(60, 80%, 60%))
        const hue = 210 - (ratio * 150); 
        const lightness = 55 + (ratio * 15); // Se vuelve un poco más brillante
        const saturation = 70 + (ratio * 10);
        
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    // --- ¡EJECUTAR! ---
    init();
});