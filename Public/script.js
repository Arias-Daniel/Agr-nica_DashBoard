document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN ---
    const API_URL = 'https://solartrace-api.onrender.com//api/data/current';
    const UPDATE_INTERVAL = 5000; // Actualizar cada 5 segundos

    const SPECTRAL_LABELS = [
        '415nm', '440nm', '485nm', '515nm', '555nm', '590nm',
        '610nm', '680nm', '730nm', '760nm', '860nm', 'Clear'
    ];
    
    const DATA_KEYS = [
        'ch_415', 'ch_440', 'ch_485', 'ch_515', 'ch_555', 'ch_590',
        'ch_610', 'ch_680', 'ch_730', 'ch_760', 'ch_860', 'ch_clear'
    ];

    // --- INICIALIZACIÓN DE GRÁFICOS ---
    let charts = {};

    const chartConfig = (label) => ({
        type: 'bar',
        data: {
            labels: SPECTRAL_LABELS,
            datasets: [{
                label: label,
                data: [],
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#d1d9e6' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // Mapeo de IDs de canvas a IDs de sensores de la API
    const chartMapping = {
        'Referencia': 'referenceChart',
        'Cama_1': 'bed1Chart',
        'Cama_2': 'bed2Chart'
    };

    // Crear los gráficos usando el mapeo
    for (const sensorId in chartMapping) {
        const canvasId = chartMapping[sensorId];
        const ctx = document.getElementById(canvasId).getContext('2d');
        charts[sensorId] = new Chart(ctx, chartConfig(`Sensor ${sensorId}`));
    }

    // --- FUNCIONES AUXILIARES ---
    function mapLuxToColor(lux, minLux = 0, maxLux = 1500) {
        if (lux === null || lux === undefined) return '#a3b1c6';
        const ratio = Math.min(Math.max(lux - minLux, 0) / (maxLux - minLux), 1);
        const hue = 60 - (ratio * 60);
        const lightness = 50 + (ratio * 10);
        return `hsl(${hue}, 80%, ${lightness}%)`;
    }

    // --- FUNCIÓN PRINCIPAL DE ACTUALIZACIÓN ---
    async function updateDashboard() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                throw new Error(`Error en la API: ${response.statusText}`);
            }
            const data = await response.json();

            for (const sensorId in data) {
                const sensorData = data[sensorId];
                const chart = charts[sensorId];

                if (sensorData && chart) {
                    // 1. Actualizar el gráfico
                    const spectralData = DATA_KEYS.map(key => sensorData[key] || 0);
                    chart.data.datasets[0].data = spectralData;
                    chart.update();

                    // 2. *** LÓGICA CORREGIDA PARA ENCONTRAR ELEMENTOS ***
                    let elementPrefix;
                    if (sensorId === 'Referencia') {
                        elementPrefix = 'ref';
                    } else if (sensorId === 'Cama_1') {
                        elementPrefix = 'bed1';
                    } else if (sensorId === 'Cama_2') {
                        elementPrefix = 'bed2';
                    }

                    if (elementPrefix) {
                        const luxValue = sensorData.total_lux || 0;
                        
                        // Actualizar texto de LUX
                        const luxElement = document.getElementById(`lux-${elementPrefix}`);
                        if (luxElement) luxElement.textContent = luxValue;
                        
                        // Actualizar color del heatmap
                        const heatmapElement = document.getElementById(`heatmap-${elementPrefix}`);
                        if (heatmapElement) heatmapElement.style.backgroundColor = mapLuxToColor(luxValue);
                    }
                }
            }
        } catch (error) {
            console.error("No se pudo actualizar el dashboard:", error);
        }
    }

    // --- EJECUCIÓN ---
    updateDashboard(); 
    setInterval(updateDashboard, UPDATE_INTERVAL);
});