document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-nzk-footer]').forEach(function (footer) {
        footer.innerHTML = `
            <div style="text-align:center; margin:30px 0 15px; font-size:11px; color:var(--text-muted);">
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
                <a href="/novidades.html" style="color:var(--text-muted);" data-nzk-version>Versão NZK</a>
            </div>
        `;
        footer.querySelectorAll('[data-nzk-version]').forEach(function (el) {
            if (window.NZK_VERSION) el.textContent = window.NZK_VERSION;
        });
    });
});
