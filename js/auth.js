/* js/auth.js */
// Controla a tela de login (Discord OAuth via Supabase Auth) e só libera
// o dashboard depois que existe uma sessão válida.

const Auth = {
    _appStarted: false,

    async init() {
        const btnLogin = document.getElementById('btnLoginDiscord');
        const btnLogout = document.getElementById('btnLogout');

        if (btnLogin) {
            btnLogin.addEventListener('click', () => {
                sb.auth.signInWithOAuth({
                    provider: 'discord',
                    options: {
                        redirectTo: window.location.origin + window.location.pathname
                    }
                });
            });
        }

        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                await sb.auth.signOut();
                window.location.href = window.location.origin + window.location.pathname;
            });
        }

        const { data: { session } } = await sb.auth.getSession();
        this.handleSession(session);

        sb.auth.onAuthStateChange((_event, newSession) => {
            this.handleSession(newSession);
        });
    },

    handleSession(session) {
        const loginScreen = document.getElementById('loginScreen');
        const appScreen = document.getElementById('appScreen');
        const userBadge = document.getElementById('userBadge');
        const loginError = document.getElementById('loginError');

        if (session && session.user) {
            loginScreen.style.display = 'none';
            appScreen.style.display = 'block';

            const meta = session.user.user_metadata || {};
            const nome = meta.full_name || meta.name || meta.custom_claims?.global_name || meta.username || 'Admin';
            if (userBadge) userBadge.innerText = `👤 ${nome}`;

            if (!this._appStarted) {
                this._appStarted = true;
                app.init();
            }
        } else {
            appScreen.style.display = 'none';
            loginScreen.style.display = 'flex';
            if (loginError) loginError.style.display = 'none';
        }
    }
};

window.addEventListener('DOMContentLoaded', () => Auth.init());
