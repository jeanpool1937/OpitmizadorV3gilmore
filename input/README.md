# Carpeta de Entrada de Datos (Input)

Coloca aquí tus archivos Excel (`.xlsx`) con los datos de demanda para pruebas de optimización.

## Formato del Excel
El sistema espera un archivo con las siguientes columnas (el nombre exacto de la cabecera puede variar si implementamos un mapeo, pero el orden o contenido ideal es):

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| A: Bobina | Código de la bobina madre | `400508` |
| B: Ancho | Ancho del corte en mm | `154.5` |
| C: Toneladas | Toneladas a fabricar (Objetivo) | `25.5` |
| D: Fecha | Fecha de necesidad (YYYY-MM-DD) | `2024-01-15` |
| E: Plan | (Opcional) Consumo Planeado | `30.0` |
| F: Stock | (Opcional) Stock Reservado | `4.5` |

> **Nota:** Actualmente el sistema no lee automáticamente de esta carpeta. Esta carpeta ha sido creada como un espacio de trabajo organizado para futuras integraciones o para que cargues el archivo manualmente en la aplicación si implementamos un botón de "Cargar Excel".
