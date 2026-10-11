import './boot.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const loadingLayer = document.querySelector<HTMLDivElement>('#loading-layer')!;
const loadingState = document.querySelector<HTMLElement>('#loading-state')!;
const retryButton = document.querySelector<HTMLButtonElement>('#loading-retry')!;

app.innerHTML = `
  <div class="boot-shell">
    <header class="boot-header">
      <a class="boot-brand" href="#" aria-label="REALDRIVE inicio">REAL<span>DRIVE</span></a>
      <span class="boot-build">VEHICLE DYNAMICS LAB <i></i> BUILD 0.1</span>
    </header>
    <main class="boot-main">
      <section class="boot-title">
        <p class="boot-kicker">PROVING GROUNDS 01 <span>·</span> TEST SESSION</p>
        <h1>REAL<span>DRIVE</span></h1>
        <p class="boot-vehicle">RD SPORT COUPE <span>RWD</span></p>
        <button id="start-test" class="start-button" type="button">
          <span>INICIAR PRUEBA</span><span class="start-arrow" aria-hidden="true">↗</span>
        </button>
        <p id="boot-message" class="boot-message" aria-live="polite">SIMULADOR DE CONDUCCIÓN · SESIÓN LIBRE</p>
      </section>
      <aside class="boot-readout" aria-label="Configuración del vehículo">
        <div><span>CONFIGURACIÓN</span><strong>FRONT ENGINE / RWD</strong></div>
        <div><span>POTENCIA</span><strong>320 CV</strong></div>
        <div><span>MASA</span><strong>1.450 KG</strong></div>
        <div><span>VEHÍCULOS</span><strong>COUPE + RALLY 4X4</strong></div>
      </aside>
    </main>
    <footer class="boot-footer"><span>REALDRIVE / VEHICLE DYNAMICS LAB</span><span>WASD · Q/E · M</span></footer>
  </div>`;

document.querySelector<HTMLButtonElement>('#start-test')!.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    const message = document.querySelector<HTMLElement>('#boot-message')!;
    button.disabled = true;
    message.textContent = 'CARGANDO MOTOR 3D Y FÍSICA…';
    loadingLayer.hidden = false;
    loadingState.textContent = 'INICIALIZANDO SIMULACIÓN';
    retryButton.hidden = true;

    try {
        const game = await import('./main');
        await game.gameReady;
        loadingLayer.hidden = true;
    } catch (error) {
        console.error(error);
        loadingState.textContent = 'NO SE PUDO INICIAR LA SIMULACIÓN';
        retryButton.hidden = false;
        retryButton.onclick = () => window.location.reload();
    }
});