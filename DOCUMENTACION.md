# Documentación Funcional - Optimizador de Corte v3 (OptiCorte)

## 1. Introducción
**OptiCorte v3** es una aplicación avanzada de optimización de corte (Cutting Stock Problem) diseñada para maximizar el aprovechamiento de bobinas de acero y gestionar la planificación de producción de manera eficiente. La herramienta permite transformar la demanda de diversos anchos y toneladas en un plan de corte optimizado, minimizando el desperdicio y organizando la secuencia de producción bajo una filosofía **JIT (Just-In-Time)**.

---

## 2. Características Principales

### 2.1. Optimización Multi-Bobina
El sistema identifica automáticamente diferentes tipos de bobinas madre a través de sus códigos y descripciones. Puede procesar múltiples grupos de demanda simultáneamente, aplicando configuraciones específicas (ancho, peso, recortes) a cada grupo de forma independiente.

### 2.2. Algoritmo de Optimización Híbrida
Utiliza un resolvedor de programación lineal (LP) combinado con heurísticas para:
- **Maximizar el Rendimiento:** Reducir al mínimo el desperdicio de material (scrap).
- **Minimizar el Set-up:** Opción de reducir la cantidad de diseños (patrones) diferentes para disminuir los cambios de cuchillas en máquina.
- **Control de Tolerancia:** Permite definir un margen de variación (Mín/Máx) sobre las toneladas solicitadas para lograr mejores combinaciones de corte.

### 2.3. Programación JIT (As Late As Possible - ALAP)
La aplicación no solo calcula *cómo* cortar, sino *cuándo* hacerlo:
- **Programación Retroactiva:** Calcula la fecha de producción ideal (típicamente 2 días antes de la fecha de demanda).
- **Gestión de Capacidad:** Respeta las horas disponibles por día y descuenta penalizaciones por cambios de bobina y cambios de cuchillas.
- **Balanceo de Carga:** Si la capacidad de un día se satura, el sistema adelanta automáticamente la producción al día anterior disponible.

---

## 3. Guía de Uso de la Interfaz

### 3.1. Configuración Global (Barra Lateral)
Desde el panel izquierdo se definen los parámetros base para el cálculo:
- **Ancho Madre y Recorte Lateral:** Dimensiones físicas de la bobina y el desorille necesario.
- **Peso de Bobina:** Peso promedio de una bobina madre.
- **Tolerancias:** Porcentaje permitido por arriba y por debajo de la demanda objetivo.
- **Capacidad de Planta:** Horas operativas diarias y tiempos de set-up (cambio de bobina/cuchillas).

### 3.2. Entrada de Demanda (Panel Principal)
El sistema ofrece tres modos de entrada:
- **Modo Rápido:** Para optimizar una sola bobina de forma inmediata.
- **Modo Multi-Bobina:** El modo principal donde se cargan listas de Excel con múltiples códigos de bobina, anchos, toneladas y fechas de entrega.
- **Carga de Excel:** Permite importar masivamente la demanda respetando las columnas de Plan, Stock, y Por Fabricar.

### 3.3. Maestro de Bobinas
El **Maestro de Bobinas** actúa como una base de datos local para la aplicación:
- **Persistencia:** Los datos se guardan en el navegador para que no se pierdan al cerrar la pestaña.
- **Sincronización:** Al cargar una demanda desde Excel, el sistema busca el "Código de Bobina" en el maestro. Si lo encuentra, aplica automáticamente el ancho y peso configurados.
- **Prioridad:** Los valores definidos en el Maestro tienen prioridad sobre los valores genéricos de la barra lateral.

---

## 4. Visualización de Resultados

### 4.1. Resumen Global
Presenta métricas clave de toda la corrida:
- **Rendimiento Global:** Porcentaje total de aprovechamiento.
- **Total de Toneladas:** Entrada (materia prima) vs Salida (producto terminado).
- **Desperdicio Acumulado:** Toneladas y porcentaje de scrap.

### 4.2. Detalle por Bobina
Cada grupo de material muestra sus propios diseños de corte, representados visualmente con su eficiencia individual. Permite la **Re-optimización Individual** en modo híbrido si un grupo específico requiere menos cambios de diseño.

### 4.3. Programa de Producción (Secuencia)
Muestra un calendario diario con:
- Capacidad utilizada (%).
- Lista de bobinas a procesar cada día.
- Tiempos estimados de operación y set-up.
- Alertas de cumplimiento de fechas.

---

## 5. Lógica Técnica y Reglas de Negocio

### 5.1. Reglas de Corte
- **Límite de Cuchillas:** El sistema respeta el máximo de cortes configurado (ej. 16 cortes por patrón).
- **Prioridad de Carga:** El algoritmo prioriza cumplir con la demanda cuya fecha de vencimiento es más próxima cuando hay conflictos de capacidad.

### 5.2. Penalizaciones de Tiempo
- **Cambio de Bobina:** Penalización de **1.5 horas** (configurable). Se aplica cuando se cambia el código de material o el ancho madre.
- **Cambio de Cuchillas:** Penalización de **0.5 horas** (configurable). Se aplica dentro de una misma bobina si el diseño de corte cambia.

### 5.3. Exportación de Datos e Informes
La aplicación permite extraer la información en múltiples formatos según la necesidad:
- **Resumen de Diseños (CSV):** Un listado plano de todos los patrones calculados, ideal para importar a otros sistemas.
- **Matriz de Producción (CSV):** Una tabla dinámica donde las columnas representan cada ancho solicitado y las celdas indican las toneladas producidas por patrón.
- **Programa de Producción (Excel):** Un archivo `.xlsx` profesional con el calendario de producción detallado por día, código y secuencia de corte.
- **Programa en PDF:** Un documento listo para imprimir con el plan de trabajo diario, incluyendo encabezados por fecha y métricas de eficiencia.

---

## 6. Recomendaciones de Optimización
Para obtener los mejores resultados:
1. Mantenga una **tolerancia del 5% al 10%** para dar flexibilidad al algoritmo.
2. Utilice el **Maestro de Bobinas** para asegurar que los anchos madre sean exactos.
3. En producciones críticas, use la función **"Optimización Híbrida"** para reducir el estrés operativo en máquina a cambio de una mínima reducción en el rendimiento.
