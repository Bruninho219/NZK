document.addEventListener('DOMContentLoaded', () => {
    const footer = document.querySelector('[data-nzk-footer]');

    if (!footer) return;

    footer.innerHTML = `
        <div style="text-align:center; margin-bottom:15px; font-size:11px; color:var(--text-muted);">
            <a href="/funcionalidades.html" style="color:var(--text-muted);">Funcionalidades</a>
            &nbsp;·&nbsp;

            <a href="/novidades.html" style="color:var(--text-muted);">Novidades</a>
            &nbsp;·&nbsp;

            <a href="/status.html" style="color:var(--text-muted);">Status</a>
            &nbsp;·&nbsp;

            <a href="/privacidade.html" style="color:var(--text-muted);">Política de Privacidade</a>
            &nbsp;·&nbsp;

            <a href="/termos.html" style="color:var(--text-muted);">Termos de Serviço</a>
            &nbsp;·&nbsp;

            <a href="/ajuda.html" style="color:var(--text-muted);">Ajuda</a>
            &nbsp;·&nbsp;

            <a href="/novidades.html"
               style="color:var(--text-muted);"
               data-nzk-version>
                VersãoNZK
            </a>
        </div>
    `;
});