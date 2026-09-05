/* js/dashboard.js */

const app = {
    selectedGuild: "",
    selectedGuildName: "",
    _lastLeaderboard: [],
    _sortLeaderboard: { col: null, asc: true },
    _leaderboardPage: 1,

    // Servidores que não têm o limite de 3 canais do YouTube (ex: seu próprio servidor)
    SEM_LIMITE_YOUTUBE: ["602623690206609418"],

    // Neutraliza caracteres HTML perigosos antes de inserir qualquer dado
    // vindo do banco (nicknames, nomes de cargo/canal, etc.) via innerHTML —
    // esses dados são controlados pelo usuário do Discord e não são confiáveis.
    escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    async init() {
        try {
            const servidores = await NZKAPI.getServidoresAtivos();
            this.renderServerList(servidores);
        } catch (err) {
            document.getElementById('serverList').innerHTML = "<p>Erro ao conectar à base de dados.</p>";
        }
        this.iniciarModoSuporte();
    },

    async iniciarModoSuporte() {
        // O painel só é mostrado se o RPC confirmar que é o dono do bot —
        // isso é só UX (esconder/mostrar), a segurança de verdade está no
        // RLS (is_guild_admin), então não tem risco em checar isso no client.
        const painel = document.getElementById('suporteModoPanel');
        if (!painel) return;
        try {
            this._souDono = await NZKAPI.souDono();
            if (!this._souDono) return;
            painel.style.display = 'block';
            this.renderSuporteAtivo();
        } catch (err) {
            console.error("Erro ao checar modo suporte:", err);
        }
    },

    async renderSuporteAtivo() {
        const el = document.getElementById('suporteListaAtiva');
        if (!el) return;
        const ativos = await NZKAPI.getSuporteAtivo();
        if (!ativos.length) {
            el.innerHTML = 'Nenhum acesso de suporte ativo no momento.';
            return;
        }
        el.innerHTML = ativos.map(a => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
                <span>${this.idCopiavel(a.guild_id)} <span style="opacity:0.7;">— ativo desde ${new Date(a.ativado_em).toLocaleString('pt-BR')}</span></span>
                <button class="btn-table-action danger" onclick="app.handleDesativarSuporte('${this.escapeHtml(a.guild_id)}')">Desativar</button>
            </div>
        `).join('');
    },

    async handleAtivarSuporte() {
        const input = document.getElementById('suporteGuildIdInput');
        const guildId = input.value.trim();
        if (!guildId || !/^\d+$/.test(guildId)) {
            return this.showToast("Informe um ID de servidor válido (só números).", "error");
        }

        const res = await NZKAPI.ativarSuporte(guildId);
        if (res.success) {
            this.showToast("🔧 Suporte ativado!");
            input.value = "";
            this.renderSuporteAtivo();
            // Recarrega a lista de servidores — o RLS já libera esse guild_id
            // agora, então ele passa a aparecer automaticamente.
            const servidores = await NZKAPI.getServidoresAtivos();
            this.renderServerList(servidores);
        } else {
            this.showToast("❌ Erro ao ativar suporte — confirma se o ID do servidor existe.", "error");
        }
    },

    async handleDesativarSuporte(guildId) {
        const res = await NZKAPI.desativarSuporte(guildId);
        if (res.success) {
            this.showToast("Suporte desativado.");
            this.renderSuporteAtivo();
        } else {
            this.showToast("❌ Erro ao desativar suporte.", "error");
        }
    },

    confirmar(mensagem, tituloBotao = "Confirmar") {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;';
            overlay.innerHTML = `
                <div style="background:var(--sidebar); border-radius:16px; padding:28px; max-width:380px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.4); animation:fadeIn 0.2s ease;">
                    <div style="font-size:14.5px; margin-bottom:22px; line-height:1.6; color:var(--text-main);">${mensagem}</div>
                    <div style="display:flex; gap:10px; justify-content:flex-end;">
                        <button class="secondary" style="margin:0; width:auto; font-size:13px; padding:12px 24px;">Cancelar</button>
                        <button class="danger" style="margin:0; width:auto; font-size:13px; padding:12px 24px;">${tituloBotao}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const fechar = (resultado) => {
                document.body.removeChild(overlay);
                resolve(resultado);
            };

            overlay.querySelector('.secondary').onclick = () => fechar(false);
            overlay.querySelector('.danger').onclick = () => fechar(true);
            overlay.onclick = (e) => { if (e.target === overlay) fechar(false); };
        });
    },

    copiarTexto(texto) {
        navigator.clipboard.writeText(texto).then(() => {
            this.showToast('📋 Copiado!');
        }).catch(() => {
            this.showToast('❌ Não foi possível copiar.', 'error');
        });
    },

    idCopiavel(id) {
        if (!id) return '—';
        const safe = this.escapeHtml(id);
        return `<code style="cursor:pointer;" title="Clique para copiar" onclick="event.stopPropagation(); app.copiarTexto('${safe}')">${safe} 📋</code>`;
    },

    showToast(mensagem, tipo = "success") {
        const existing = document.querySelector('.nzk-toast');
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.className = `nzk-toast ${tipo}`;
        toast.innerHTML = mensagem;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    showLoading(tbodyId) {
        document.getElementById(tbodyId).innerHTML = `
            <tr><td colspan="10" class="loading-cell">
                <div class="loading-spinner"></div> Carregando...
            </td></tr>
        `;
    },

    formatarVoz(minutos) {
        if (!minutos) return "0m";
        if (minutos < 60) return `${minutos}m`;
        const h = Math.floor(minutos / 60);
        const m = minutos % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    },

	async renderServerList(servidores) {
		console.log('Servidores recebidos do Supabase:', servidores);

		const list = document.getElementById('serverList');

        // Fallback só pra servidores que ainda não passaram por !nSync depois
        // dessa atualização — nome/ícone agora vêm de verdade do Discord
        // (gravados pelo sync.py), sem precisar editar essa lista à mão.
        const guildDataFallback = {
            "602623690206609418": { name: "Nazarick", icon: "img/nazarick.gif" },
            "1044253947751309372": { name: "Serv Baharuth", icon: "img/baharuth.png" },
            "1089351461588176908": { name: "Serv Teocracia Slane", icon: "img/slane2.png" },
            "100000000": { name: "Test Server", icon: "🧪" }
        };

        const priorityOrder = [
            "602623690206609418",
            "1044253947751309372",
            "1089351461588176908"
        ];

        const nomeDe = (srv) => srv.nome_servidor || guildDataFallback[srv.id]?.name || "Servidor Ativo";
        const iconeDe = (srv) => srv.icon_url || guildDataFallback[srv.id]?.icon || "🏰";

        servidores.sort((a, b) => {
            const indexA = priorityOrder.indexOf(a.id);
            const indexB = priorityOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return nomeDe(a).toLowerCase().localeCompare(nomeDe(b).toLowerCase());
        });

        // Guarda pra alimentar o trocador rápido de servidor no cabeçalho do editor
        this._servidoresDisponiveis = servidores.map(srv => ({
            id: srv.id,
            name: nomeDe(srv),
            removido: srv.removido_em
        }));

        list.innerHTML = servidores.map(srv => {
            const id = srv.id;
            const nome = nomeDe(srv);
            const icone = iconeDe(srv);
            const removido = srv.removido_em;
            const diasRemovido = removido
                ? Math.floor((Date.now() - new Date(removido)) / 86400000)
                : null;
			const tipo = srv.tipo || 'comum';

			let badgeTipo = '';

			if (tipo === 'adm') {
				badgeTipo = '<div class="server-type-badge server-type-adm">👑 ADM</div>';
			} else if (tipo === 'premium') {
				badgeTipo = '<div class="server-type-badge server-type-premium">💎 PREMIUM</div>';
			}

            // Só o "id" (sempre um snowflake numérico) vai pro onclick — o
            // nome nunca é interpolado ali. Nome de servidor agora vem do
            // Discord (não é mais fixo no código), então colocar direto
            // dentro de um onclick="...('${nome}')" seria arriscado: um nome
            // com aspas quebraria o JavaScript. loadConfig() resolve o nome
            // sozinho a partir de _servidoresDisponiveis.
            return `
                <div class="server-card ${removido ? 'server-card-removido' : ''}" onclick="app.loadConfig('${id}')">
                    <div class="icon-wrapper">
                        ${icone.includes('/')
                            ? `<img src="${icone}${icone.includes('?') ? '&' : '?'}t=${Date.now()}" class="server-icon-img">`
                            : `<span class="server-icon">${icone}</span>`}
                    </div>
						<h3>${this.escapeHtml(nome)}</h3>
						${badgeTipo}
						${this.idCopiavel(id)}
						${removido ? `<div class="server-removido-badge">⚠️ Bot removido há ${diasRemovido}d</div>` : ''}
					</div>
            `;
        }).join('') + `
            <div class="server-card" onclick="window.location.href='/invite'" style="border: 1px dashed rgba(255,255,255,0.2); background: rgba(255,255,255,0.02);">
                <div class="icon-wrapper">
                    <div style="width:55px; height:55px; border-radius:50%; background:var(--success); display:flex; align-items:center; justify-content:center; font-size:30px; font-weight:800; color:white; line-height:1;">+</div>
                </div>
                <h3>Convidar o bot pro seu servidor</h3>
            </div>
        `;
    },

    renderServerSwitcher() {
        const el = document.getElementById('serverSwitcher');
        if (!el) return;

        const lista = this._servidoresDisponiveis || [];

        // Assinatura simples da lista atual, pra saber se precisa reconstruir
        // as <option> de verdade ou só marcar qual está selecionada.
        const assinatura = lista.map(s => s.id).join(',');

        if (el.dataset.assinatura !== assinatura) {
            // Reconstrói as opções só quando a lista de servidores realmente
            // muda (ex: primeiro carregamento, ou suporte ativado/desativado).
            el.innerHTML = lista.map(srv => {
                const nome = this.escapeHtml(srv.name);
                return `
                <option value="${this.escapeHtml(srv.id)}" data-name="${nome}">
                    ${srv.removido ? '⚠️ ' : ''}${nome}
                </option>
            `;
            }).join('');
            el.dataset.assinatura = assinatura;
        }

        // Só troca qual opção está marcada — não recria nenhum <option>.
        // Recriar todo o <select> de dentro do próprio evento "change" dele
        // (troca via o switcher) causava um glitch visual determinístico no
        // Chrome/Windows: o rótulo antigo "fantasma" ficava sobreposto ao
        // novo por um frame, ainda com o navegador processando o fechamento
        // do dropdown nativo daquele mesmo evento.
        el.value = this.selectedGuild;
    },

    handleSwitchServer() {
        const sel = document.getElementById('serverSwitcher');
        const guildId = sel.value;
        const guildName = sel.options[sel.selectedIndex].getAttribute('data-name');
        if (guildId === this.selectedGuild) return;
        this.loadConfig(guildId, guildName);
    },

    async loadConfig(guildId, guildName) {
        if (guildName === undefined) {
            const encontrado = (this._servidoresDisponiveis || []).find(s => s.id === guildId);
            guildName = encontrado ? encontrado.name : "Servidor Ativo";
        }
        this.selectedGuild = guildId;
        this.selectedGuildName = guildName;

        window.scrollTo({ top: 0, behavior: 'instant' });

        history.pushState({ page: "editor", guildId }, "", `#server-${guildId}`);

        document.getElementById('selector').style.display = 'none';
        document.getElementById('editor').style.display = 'block';
        // serverTitle já é "Painel" estático no HTML e nada mais muda esse
        // texto — reatribuir innerText aqui recriava o nó de texto do zero a
        // cada troca de servidor sem necessidade, e isso disparava o
        // MutationObserver do i18n.js, que retraduz a página inteira (todas
        // as tabelas incluídas) a cada mudança de nó. Esse reflow pesado e
        // desnecessário era o que causava o tremor ao trocar de servidor.

        const painelSuporte = document.getElementById('suporteModoPanel');
        if (painelSuporte) painelSuporte.style.display = 'none';

        this.renderServerSwitcher();

        const statusSection = document.getElementById('statusSection');
        statusSection.style.display = guildId === "602623690206609418" ? "block" : "none";

        this.renderYoutubeLimiteHint();

        this.showLoading('patenteBody');
        this.showLoading('leaderboardBody');

        // fetchAndRender popula vários campos/tabelas — um erro em qualquer
        // parte dele (ex: elemento HTML que não existe mais, dado inesperado
        // do banco) não pode impedir o realtime de iniciar logo abaixo. Isso
        // já aconteceu antes: um campo faltando quebrou fetchAndRender e,
        // como consequência silenciosa, o indicador de tempo real parava de
        // funcionar também, sem nenhum erro visível pro usuário.
        try {
            await this.fetchAndRender(guildId);
        } catch (err) {
            console.error("Erro ao carregar dados do servidor:", err);
            this.showToast("❌ Alguns dados podem não ter carregado — veja o console.", "error");
        }

        this.iniciarRealtime(guildId);
        this.iniciarRealtimeAuditLog(guildId);
    },

    iniciarRealtime(guildId) {
        // Remove qualquer inscrição anterior antes de criar uma nova
        // (evita ficar acumulando conexões ao trocar de servidor)
        if (this._realtimeChannel) {
            sb.removeChannel(this._realtimeChannel);
            this._realtimeChannel = null;
        }

        this.setRealtimeStatus(false);

        const channel = sb.channel(`niveis-${guildId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'niveis',
                filter: `guild_id=eq.${guildId}`
            }, () => this.atualizarLeaderboardEmTempoReal())
            .subscribe((status) => {
                // Ignora callback de um canal antigo que já foi trocado —
                // evita que o status do servidor anterior sobrescreva o do
                // servidor atual (chega atrasado, de forma assíncrona).
                if (this._realtimeChannel !== channel) return;
                this.setRealtimeStatus(status === 'SUBSCRIBED');
            });

        this._realtimeChannel = channel;
    },

    setRealtimeStatus(conectado) {
        // Badge fica sempre visível no layout (nunca alterna display:none),
        // só a cor muda — evita o elemento sumir/reaparecer e "empurrar"
        // o título/switcher do lado, que gerava um flash visual ao trocar
        // de servidor.
        const badge = document.getElementById('realtimeBadge');
        const dot = document.getElementById('realtimeDot');
        if (!badge || !dot) return;
        const cor = conectado ? 'var(--success)' : 'var(--danger)';
        badge.style.background = conectado ? 'rgba(35,165,89,0.12)' : 'rgba(237,66,69,0.12)';
        dot.style.background = cor;
        dot.style.boxShadow = `0 0 6px ${cor}`;
    },

    pararRealtime() {
        if (this._realtimeChannel) {
            sb.removeChannel(this._realtimeChannel);
            this._realtimeChannel = null;
        }
        this.setRealtimeStatus(false);
    },

    iniciarRealtimeAuditLog(guildId) {
        if (this._auditChannel) {
            sb.removeChannel(this._auditChannel);
            this._auditChannel = null;
        }

        this._auditChannel = sb.channel(`audit-log-${guildId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'audit_log',
                filter: `guild_id=eq.${guildId}`
            }, (payload) => {
                this.renderAuditLog(guildId);
                // Avisa mesmo se o admin não estiver com a aba Admin aberta no momento
                const quem = this.escapeHtml(payload.new?.actor_name || 'Alguém');
                this.showToast(`📜 ${quem} registrou uma ação no log`);
            })
            .subscribe();
    },

    pararRealtimeAuditLog() {
        if (this._auditChannel) {
            sb.removeChannel(this._auditChannel);
            this._auditChannel = null;
        }
    },

    async atualizarLeaderboardEmTempoReal() {
        if (!this.selectedGuild) return;
        const data = await NZKAPI.getLeaderboard(this.selectedGuild);
        this._lastLeaderboard = data;
        this.renderLeaderboard(data);
        this.renderEstatisticas(data);
    },

    async fetchAndRender(guildId) {
        this.showLoading('patenteBody');
        this.showLoading('leaderboardBody');

        const data = await Promise.all([
            NZKAPI.getCargos(guildId),
            NZKAPI.getPatentes(guildId),
            NZKAPI.getLeaderboard(guildId),
            NZKAPI.getCanais(guildId),
            NZKAPI.getConquistasUsuarios(guildId)
        ]);

        this.renderRoles(data[0]);
        this.renderChannels(data[3]);
        this.renderTable(data[1]);
        this._leaderboardPage = 1;
        this._lastLeaderboard = data[2];
        this._conquistasUsuario = data[4];
        this.renderLeaderboard(data[2]);
        this.renderEstatisticas(data[2]);
        this.renderHistoricoSelect(data[2]);
        this.renderConquistasTable(guildId);

        // Popula selects da aba Admin
        const opts = '<option value="">-- Selecionar membro --</option>' +
            data[2].map(u => `<option value="${this.escapeHtml(u.user_id)}">${this.escapeHtml(u.username || u.user_id)}</option>`).join('');
        ['resetUsuario', 'editUsuario'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) { const cur = sel.value; sel.innerHTML = opts; if (cur) sel.value = cur; }
        });
        await this.loadSavedConfigs(guildId);
        await this.renderYoutubeMonitores(guildId);
        await this.renderAuditLog(guildId);
        await this.renderTwitchMonitores(guildId);

        // Se a aba Ranking já estiver aberta (ex: trocou de servidor ou clicou
        // em "Atualizar" sem sair da aba), o gráfico precisa ser atualizado
        // aqui também — o gatilho do switchTab só cobre a troca de aba em si.
        const abaRanking = document.getElementById('tab-ranking');
        if (abaRanking && abaRanking.style.display === 'block') {
            this.renderXpServidorGrafico(guildId);
        }
    },

    async renderAuditLog(guildId) {
        const body = document.getElementById('auditLogBody');
        if (!body) return;

        const acoesTraduzidas = {
            reset_server: '💥 Reset total do servidor',
            reset_user: '🗑️ Reset de usuário',
            edit_user: '✏️ Edição de nível/XP',
            set_xp: '⭐ XP definido manualmente',
            set_level: '📈 Nível definido manualmente'
        };

        const data = await NZKAPI.getAuditLog(guildId);

        if (!data.length) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">Nenhuma ação registrada ainda.</td></tr>';
            return;
        }

        body.innerHTML = data.map(log => {
            const data_fmt = new Date(log.created_at).toLocaleString(NZKI18n?.language || 'pt-BR');
            const acaoNome = acoesTraduzidas[log.action] || log.action;
            const alvo = this.idCopiavel(log.target_id);
            return `
                <tr>
                    <td>${data_fmt}</td>
                    <td>${this.escapeHtml(log.actor_name || log.actor_id)}</td>
                    <td>${acaoNome}</td>
                    <td>${alvo}</td>
                </tr>
            `;
        }).join('');
    },

    // Define .value (ou .checked) só se o elemento existir — um campo que
    // não existe mais no HTML (ou ainda não foi adicionado) não pode quebrar
    // o preenchimento de todos os outros campos desta função.
    setVal(id, valor) {
        const el = document.getElementById(id);
        if (el) el.value = valor;
    },

    setChecked(id, valor) {
        const el = document.getElementById(id);
        if (el) el.checked = valor;
    },

    async loadSavedConfigs(guildId) {
        const config = await NZKAPI.getConfigs(guildId);
        if (config) {
            if (config.canal_avisos_id) this.setVal('channelSelect', config.canal_avisos_id);
            if (config.cargo_top1_id) this.setVal('top1Select', config.cargo_top1_id);
            if (config.status_texto) this.setVal('statusInput', config.status_texto);
            if (config.tipo_atividade !== null) this.setVal('statusType', config.tipo_atividade);
            this.renderStatusExpiraInfo(config.status_expira_em || null);
            this.setVal('levelupMensagem', config.levelup_mensagem || '');
            this.setVal('bonusBooster', config.bonus_booster || 0);
            if (config.canal_boost_id) this.setVal('boostChannel', config.canal_boost_id);
            if (config.canal_boas_vindas_id) this.setVal('boasVindasChannel', config.canal_boas_vindas_id);
            this.setVal('boasVindasMensagem', config.boas_vindas_mensagem || '');
			this.cargosEntradaAtuais = Array.isArray(config.cargos_entrada) ? config.cargos_entrada.map(String) : [];
			this.renderCargosEntradaTable();
            this.setVal('boostXp', config.bonus_boost_xp || 0);
            this.setVal('boostMensagem', config.boost_mensagem || '');
            this.setVal('bonusAdmin', config.bonus_admin || 0);
            this.setVal('bonusStack', config.bonus_stack === false ? "nao" : "sim");
            this.setChecked('boostAfetaAdmin', config.boost_afeta_bonus_admin !== false);
            this.setVal('xpMensagem', config.xp_mensagem ?? 20);
            this.setVal('xpReacao', config.xp_reacao ?? 5);
            this.setVal('xpVozMinuto', config.xp_voz_minuto ?? 15);
            this.setVal('cooldownMensagem', config.cooldown_mensagem_segundos ?? 15);
            this.setVal('cooldownReacao', config.cooldown_reacao_segundos ?? 5);
        } else {
            this.setVal('channelSelect', "");
            this.setVal('top1Select', "");
            this.setVal('statusInput', "");
            this.setVal('statusType', "0");
            const statusExpiraInfo = document.getElementById('statusExpiraInfo');
            if (statusExpiraInfo) statusExpiraInfo.textContent = "";
            this.setVal('levelupMensagem', '');
            this.setVal('bonusBooster', 0);
            this.setVal('boostChannel', "");
            this.setVal('boasVindasChannel', "");
            this.setVal('boasVindasMensagem', "");
            this.cargosEntradaAtuais = [];
            this.renderCargosEntradaTable();
            this.setVal('boostXp', 0);
            this.setVal('boostMensagem', '');
            this.setVal('bonusAdmin', 0);
            this.setVal('bonusStack', "sim");
            this.setChecked('boostAfetaAdmin', true);
            this.setVal('xpMensagem', 20);
            this.setVal('xpReacao', 5);
            this.setVal('xpVozMinuto', 15);
            this.setVal('cooldownMensagem', 15);
            this.setVal('cooldownReacao', 5);
        }
    },





    async handleResetarServidor() {
        if (!(await this.confirmar("⚠️ Isso vai zerar <b>TODOS</b> os níveis e XP do servidor.<br>Tem certeza?", "Zerar tudo"))) return;
        if (!(await this.confirmar("⚠️ Última confirmação — essa ação <b>não pode ser desfeita</b>!", "Confirmar reset"))) return;
        const res = await NZKAPI.resetarServidor(this.selectedGuild);
        if (res.success) {
            this.showToast("✅ Todos os níveis foram resetados!");
            NZKAPI.logAcao(this.selectedGuild, "reset_server");
        } else this.showToast("❌ Erro ao resetar.", "error");
    },

    async handleResetarUsuario() {
        const sel = document.getElementById('resetUsuario');
        if (!sel.value) return this.showToast("Selecione um usuário.", "error");
        const nome = this.escapeHtml(sel.options[sel.selectedIndex].text);
        if (!(await this.confirmar(`⚠️ Resetar nível e XP de <b>${nome}</b>?`, "Resetar"))) return;
        const res = await NZKAPI.resetarUsuario(this.selectedGuild, sel.value);
        if (res.success) {
            this.showToast(`✅ ${nome} resetado!`);
            NZKAPI.logAcao(this.selectedGuild, "reset_user", sel.value);
        } else this.showToast("❌ Erro ao resetar.", "error");
    },

    async handleEditarUsuario() {
        const sel   = document.getElementById('editUsuario');
        const level = document.getElementById('editLevel').value;
        const xp    = document.getElementById('editXP').value;
        if (!sel.value) return this.showToast("Selecione um usuário.", "error");
        if (level === "" || xp === "") return this.showToast("Preencha nível e XP.", "error");
        const res = await NZKAPI.editarUsuario(this.selectedGuild, sel.value, level, xp);
        if (res.success) {
            this.showToast(`✅ ${this.escapeHtml(sel.options[sel.selectedIndex].text)} atualizado!`);
            NZKAPI.logAcao(this.selectedGuild, "edit_user", sel.value, { level, xp });
        } else this.showToast("❌ Erro ao editar.", "error");
    },


    renderYoutubeLimiteHint() {
        const el = document.getElementById('youtubeLimiteHint');
        if (!el) return;
        if (this.SEM_LIMITE_YOUTUBE.includes(this.selectedGuild)) {
            el.innerHTML = '💡 Aceita <b>@handle</b>, URL completa ou ID <b>UCxxxx</b> — sem limite de canais neste servidor. 👑';
        } else {
            el.innerHTML = '💡 Aceita <b>@handle</b>, URL completa ou ID <b>UCxxxx</b> — máximo 5 canais por servidor.';
        }
    },

    async renderYoutubeMonitores(guildId) {
        const data = await NZKAPI.getYoutubeMonitores(guildId);
        const body = document.getElementById('youtubeBody');
        if (!body) return;

        if (!data.length) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Nenhum canal monitorado.</td></tr>';
            return;
        }

        body.innerHTML = data.map(m => `
            <tr>
                <td>${this.escapeHtml(m.youtube_channel_name || m.youtube_channel_id)}</td>
                <td>${this.idCopiavel(m.youtube_channel_id)}</td>
                <td>#${this.escapeHtml(m.discord_channel_id)}</td>
                <td>
                    <span style="color: ${m.ativo ? 'var(--success)' : 'var(--danger)'}">
                        ${m.ativo ? '✅ Ativo' : '⏸️ Pausado'}
                    </span>
                </td>
                <td style="display:flex; gap:8px;">
                    <button class="btn-table-action secondary" onclick="app.toggleYoutube(${m.id}, ${!m.ativo})">
                        ${m.ativo ? '⏸️ Pausar' : '▶️ Ativar'}
                    </button>
                    <button class="btn-table-action danger" onclick="app.deletarYoutube(${m.id})">Excluir</button>
                </td>
            </tr>
        `).join('');
    },

    async handleAdicionarYoutube() {
        const entrada     = document.getElementById('youtubeChannelId').value.trim();
        const channelName = document.getElementById('youtubeChannelName').value.trim();
        const discordCh   = document.getElementById('youtubeDiscordChannel').value;

        if (!entrada) return this.showToast("Informe o canal do YouTube.", "error");
        if (!discordCh) return this.showToast("Selecione o canal do Discord.", "error");

        // Limite de 5 (exceto servidores na lista SEM_LIMITE_YOUTUBE)
        if (!this.SEM_LIMITE_YOUTUBE.includes(this.selectedGuild)) {
            const atual = await NZKAPI.getYoutubeMonitores(this.selectedGuild);
            if (atual.length >= 5) return this.showToast("Limite de 5 canais atingido.", "error");
        }

        this.showToast("🔄 Resolvendo canal...");

        // Resolve @handle, URL ou ID direto
        const resolvido = await NZKAPI.resolverYoutubeChannelId(entrada);
        if (!resolvido) return this.showToast("❌ Não foi possível encontrar o canal. Verifique o @handle ou ID.", "error");

        const res = await NZKAPI.salvarYoutubeMonitor({
            guild_id: this.selectedGuild,
            youtube_channel_id: resolvido.id,
            youtube_channel_name: channelName || resolvido.nome || entrada,
            discord_channel_id: discordCh,
            ativo: true
        });

        if (res.success) {
            this.showToast("▶️ Canal do YouTube adicionado!");
            document.getElementById('youtubeChannelId').value = '';
            document.getElementById('youtubeChannelName').value = '';
            this.renderYoutubeMonitores(this.selectedGuild);
        } else {
            this.showToast("❌ Erro ao adicionar.", "error");
        }
    },

    async toggleYoutube(id, ativo) {
        const res = await NZKAPI.toggleYoutubeMonitor(id, ativo);
        if (res.success) {
            this.showToast(ativo ? "▶️ Monitor ativado!" : "⏸️ Monitor pausado!");
            this.renderYoutubeMonitores(this.selectedGuild);
        }
    },

    async deletarYoutube(id) {
        if (!(await this.confirmar("Remover este canal monitorado?", "Remover"))) return;
        const res = await NZKAPI.deletarYoutubeMonitor(id);
        if (res.success) {
            this.showToast("🗑️ Monitor removido.");
            this.renderYoutubeMonitores(this.selectedGuild);
        }
    },

    async renderTwitchMonitores(guildId) {
        const data = await NZKAPI.getTwitchMonitores(guildId);
        const body = document.getElementById('twitchBody');
        if (!body) return;

        if (!data.length) {
            body.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px;">Nenhum canal monitorado.</td></tr>';
            return;
        }

        body.innerHTML = data.map(m => `
            <tr>
                <td>
                    <a href="https://twitch.tv/${encodeURIComponent(m.twitch_username)}" target="_blank" style="color:var(--text-main); text-decoration:none;">
                        ${this.escapeHtml(m.twitch_username)}
                    </a>
                </td>
                <td>#${this.escapeHtml(m.discord_channel_id)}</td>
                <td style="display:flex; gap:8px;">
                    <span style="color: ${m.ativo ? 'var(--success)' : 'var(--danger)'}; align-self:center;">
                        ${m.ativo ? '✅ Ativo' : '⏸️ Pausado'}
                    </span>
                    <button class="btn-table-action secondary" onclick="app.toggleTwitch(${m.id}, ${!m.ativo})">
                        ${m.ativo ? '⏸️ Pausar' : '▶️ Ativar'}
                    </button>
                    <button class="btn-table-action danger" onclick="app.deletarTwitch(${m.id})">Excluir</button>
                </td>
            </tr>
        `).join('');
    },

    async handleAdicionarTwitch() {
        const username = document.getElementById('twitchUsername').value.trim().replace(/^@/, '').toLowerCase();
        const discordCh = document.getElementById('twitchDiscordChannel').value;

        if (!username) return this.showToast("Informe o nome de usuário da Twitch.", "error");
        if (!discordCh) return this.showToast("Selecione o canal do Discord.", "error");

        const atual = await NZKAPI.getTwitchMonitores(this.selectedGuild);
        if (atual.length >= 5) return this.showToast("Limite de 5 canais atingido.", "error");

        const res = await NZKAPI.salvarTwitchMonitor({
            guild_id: this.selectedGuild,
            twitch_username: username,
            discord_channel_id: discordCh,
            ativo: true
        });

        if (res.success) {
            this.showToast("💜 Canal da Twitch adicionado!");
            document.getElementById('twitchUsername').value = '';
            this.renderTwitchMonitores(this.selectedGuild);
        } else {
            this.showToast("❌ Erro ao adicionar.", "error");
        }
    },

    async toggleTwitch(id, ativo) {
        const res = await NZKAPI.toggleTwitchMonitor(id, ativo);
        if (res.success) {
            this.showToast(ativo ? "▶️ Monitor ativado!" : "⏸️ Monitor pausado!");
            this.renderTwitchMonitores(this.selectedGuild);
        }
    },

    async deletarTwitch(id) {
        if (!(await this.confirmar("Remover este canal monitorado?", "Remover"))) return;
        const res = await NZKAPI.deletarTwitchMonitor(id);
        if (res.success) {
            this.showToast("🗑️ Monitor removido.");
            this.renderTwitchMonitores(this.selectedGuild);
        }
    },

    async handleSalvarBoasVindasCanal() {
        const canal = document.getElementById('boasVindasChannel').value;
        const cargos = this.cargosEntradaAtuais || [];
        const res   = await NZKAPI.salvarBoasVindasCanal(this.selectedGuild, canal, cargos);
        if (res.success) this.showToast("👋 Canal e cargo de boas-vindas salvos!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },

    async handleSalvarBoasVindasMensagem() {
        const msg = document.getElementById('boasVindasMensagem').value;
        const res = await NZKAPI.salvarBoasVindasMensagem(this.selectedGuild, msg);
        if (res.success) this.showToast(msg ? "👋 Mensagem de boas-vindas salva!" : "👋 Mensagem removida!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },

	async handleAdicionarCargoEntrada() {
		const sel = document.getElementById('cargoEntradaSelect');
		const roleId = sel.value;

		if (!roleId) {
			return this.showToast("Selecione um cargo.", "error");
		}

		this.cargosEntradaAtuais = Array.isArray(this.cargosEntradaAtuais)
			? [...this.cargosEntradaAtuais].map(String)
			: [];

		if (this.cargosEntradaAtuais.length >= 10) {
			return this.showToast("Limite de 10 cargos atingido.", "error");
		}

		if (this.cargosEntradaAtuais.includes(String(roleId))) {
			return this.showToast("Esse cargo já foi adicionado.", "error");
		}

		const anterior = [...this.cargosEntradaAtuais];

		this.cargosEntradaAtuais.push(String(roleId));

		// Atualiza a tabela imediatamente
		this.renderCargosEntradaTable();

		// Limpa o select
		sel.value = "";

		const canal = document.getElementById('boasVindasChannel')?.value || "";

		try {
			const res = await NZKAPI.salvarBoasVindasCanal(
				this.selectedGuild,
				canal,
				this.cargosEntradaAtuais
			);

			if (!res?.success) {
				throw new Error("Falha ao salvar cargo automático.");
			}

			this.showToast("✅ Cargo automático adicionado!");
		} catch (err) {
			console.error("Erro ao adicionar cargo automático:", err);

			// Se falhar no banco, desfaz a alteração local
			this.cargosEntradaAtuais = anterior;
			this.renderCargosEntradaTable();

			this.showToast(
				"❌ Erro ao salvar o cargo automático.",
				"error"
			);
		}
	},

	async handleRemoverCargoEntrada(roleId) {
		this.cargosEntradaAtuais = Array.isArray(this.cargosEntradaAtuais)
			? [...this.cargosEntradaAtuais].map(String)
			: [];

		const roleIdStr = String(roleId);
		const anterior = [...this.cargosEntradaAtuais];

		const novaLista = this.cargosEntradaAtuais.filter(
			id => id !== roleIdStr
		);

		// O cargo já não estava na lista
		if (novaLista.length === anterior.length) {
			return;
		}

		this.cargosEntradaAtuais = novaLista;

		// Atualiza a tabela imediatamente
		this.renderCargosEntradaTable();

		const canal = document.getElementById('boasVindasChannel')?.value || "";

		try {
			const res = await NZKAPI.salvarBoasVindasCanal(
				this.selectedGuild,
				canal,
				this.cargosEntradaAtuais
			);

			if (!res?.success) {
				throw new Error("Falha ao remover cargo automático.");
			}

			this.showToast("🗑️ Cargo automático removido.");
		} catch (err) {
			console.error("Erro ao remover cargo automático:", err);

			// Se falhar no banco, restaura a lista anterior
			this.cargosEntradaAtuais = anterior;
			this.renderCargosEntradaTable();

			this.showToast(
				"❌ Erro ao remover o cargo automático.",
				"error"
			);
		}
	},

    renderCargosEntradaTable() {
        const body = document.getElementById('cargosEntradaBody');
        if (!body) return;

        const lista = this.cargosEntradaAtuais || [];
        if (!lista.length) {
            body.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--text-muted); padding:15px;">Nenhum cargo automático configurado.</td></tr>';
            return;
        }

        body.innerHTML = lista.map(roleId => {
            const cargo = (this._cargosDisponiveis || []).find(c => c.role_id === roleId);
            const nome = this.escapeHtml(cargo ? cargo.role_name : `Cargo removido (${roleId})`);
            return `
                <tr>
                    <td>${nome}</td>
                    <td><button class="btn-table-action danger" onclick="app.handleRemoverCargoEntrada('${this.escapeHtml(roleId)}')">Excluir</button></td>
                </tr>
            `;
        }).join('');
    },

    handleTestarBoasVindas() {
        const mensagem_raw = document.getElementById('boasVindasMensagem').value
            || "Bem-vindo(a) ao {servidor}, {usuario}!";
        const mensagem = mensagem_raw
            .replace("{usuario}", "**[USUÁRIO TESTE]**")
            .replace("{servidor}", this.selectedGuildName)
            .replace("{membros}", "**[Nº DE MEMBROS]**");

        const nomes = (this.cargosEntradaAtuais || []).map(roleId => {
            const cargo = (this._cargosDisponiveis || []).find(c => c.role_id === roleId);
            return cargo ? this.escapeHtml(cargo.role_name) : null;
        }).filter(Boolean);
        const cargoNome = nomes.length ? nomes.join(', ') : null;

        const preview = document.getElementById('boasVindasPreview');
        preview.innerHTML = `
            <div style="background:rgba(88,101,242,0.1); border:1px solid rgba(88,101,242,0.3); border-radius:10px; padding:15px; margin-top:10px;">
                <div style="font-weight:800; color:var(--accent); margin-bottom:8px;">👋 Prévia da mensagem</div>
                <div style="margin-bottom:8px;">${mensagem}</div>
                <div style="font-size:11px; color:var(--text-muted);">🖼️ Thumbnail: foto do perfil do usuário</div>
                ${cargoNome ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">🎭 Cargos atribuídos: <b>${cargoNome}</b></div>` : ''}
            </div>
        `;
    },

    async handleSalvarBoostCanal() {
        const canal = document.getElementById('boostChannel').value;
        const xp    = document.getElementById('boostXp').value;
        const afetaAdmin = document.getElementById('boostAfetaAdmin').checked;
        const res   = await NZKAPI.salvarBoostCanal(this.selectedGuild, canal, xp, afetaAdmin);
        if (res.success) this.showToast("💜 Canal e XP de boost salvos!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },

    async handleSalvarXpConfig() {
        const xpMensagem   = document.getElementById('xpMensagem').value;
        const xpReacao     = document.getElementById('xpReacao').value;
        const xpVozMinuto  = document.getElementById('xpVozMinuto').value;
        const res = await NZKAPI.salvarXpConfig(this.selectedGuild, xpMensagem, xpReacao, xpVozMinuto);
        if (res.success) this.showToast("⭐ Configuração de XP salva!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },

    async handleSalvarCooldowns() {
        const cooldownMensagem = document.getElementById('cooldownMensagem').value;
        const cooldownReacao   = document.getElementById('cooldownReacao').value;
        const res = await NZKAPI.salvarCooldowns(this.selectedGuild, cooldownMensagem, cooldownReacao);
        if (res.success) this.showToast("⏱️ Cooldown salvo!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },

    async handleSalvarBoostMensagem() {
        const mensagem = document.getElementById('boostMensagem').value;
        const res      = await NZKAPI.salvarBoostMensagem(this.selectedGuild, mensagem);
        if (res.success) this.showToast(mensagem ? "💜 Mensagem de boost salva!" : "💜 Mensagem removida!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },


    async handleTestarBoost() {
        const canal = document.getElementById('boostChannel').value;
        if (!canal) return this.showToast("Selecione um canal primeiro.", "error");

        const mensagem_raw = document.getElementById('boostMensagem').value
            || "{usuario} acabou de impulsionar o servidor! Obrigado pelo apoio!";
        const xp = document.getElementById('boostXp').value || 0;

        const mensagem = mensagem_raw
            .replace("{usuario}", "**[USUÁRIO TESTE]**")
            .replace("{servidor}", this.selectedGuildName)
            .replace("{xp}", xp);

        // Envia preview visual no painel
        const preview = document.getElementById('boostPreview');
        preview.innerHTML = `
            <div style="background:rgba(255,115,250,0.1); border:1px solid rgba(255,115,250,0.3); border-radius:10px; padding:15px; margin-top:10px;">
                <div style="font-weight:800; color:#ff73fa; margin-bottom:8px;">💜 Novo Impulso! <span style="font-size:11px; color:var(--text-muted);">(prévia)</span></div>
                <div style="margin-bottom:8px;">${mensagem}</div>
                ${xp > 0 ? `<div style="font-size:12px; color:var(--success);">🎁 Recompensa: <b>+${xp} XP</b> de bônus!</div>` : ''}
                <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">🖼️ Thumbnail: foto do perfil do usuário</div>
            </div>
        `;
    },


    async handleSalvarLevelupMensagem() {
        const msg = document.getElementById('levelupMensagem').value;
        const res = await NZKAPI.salvarLevelupMensagem(this.selectedGuild, msg);
        if (res.success) this.showToast(msg ? "✅ Mensagem de level up salva!" : "✅ Mensagem padrão restaurada!");
        else this.showToast("❌ Erro ao salvar.", "error");
    },

    async handleSalvarBonus() {
        const booster = document.getElementById('bonusBooster').value;
        const admin   = document.getElementById('bonusAdmin').value;
        const stack   = document.getElementById('bonusStack').value === "sim";
        const res = await NZKAPI.salvarBonus(this.selectedGuild, booster, admin, stack);
        if (res.success) this.showToast("🎯 Bônus de XP salvo!");
        else this.showToast("❌ Erro ao salvar bônus.", "error");
    },

    async handleSalvarStatus() {
        const texto = document.getElementById('statusInput').value;
        const tipo = document.getElementById('statusType').value;
        const horas = parseInt(document.getElementById('statusDuracao').value);
        if (!this.selectedGuild) return this.showToast("Selecione um servidor primeiro.", "error");

        const expiraEm = horas > 0
            ? new Date(Date.now() + horas * 60 * 60 * 1000).toISOString()
            : null;

        const res = await NZKAPI.salvarStatusBot(this.selectedGuild, texto, tipo, expiraEm);
        if (res.success) {
            this.showToast("✅ Status salvo com sucesso!");
            this.renderStatusExpiraInfo(expiraEm);
        } else {
            this.showToast("❌ Erro ao salvar status.", "error");
        }
    },

    renderStatusExpiraInfo(expiraEm) {
        const el = document.getElementById('statusExpiraInfo');
        if (!el) return;
        if (!expiraEm) {
            el.textContent = '♾️ Esse status fica valendo até você trocar de novo.';
            return;
        }
        const data = new Date(expiraEm);
        el.textContent = `⏳ Esse status volta ao padrão em ${data.toLocaleString(NZKI18n?.language || 'pt-BR')}.`;
    },

    renderRoles(cargos) {
        this._cargosDisponiveis = cargos;
        const html = cargos.map(r => {
            const nome = this.escapeHtml(r.role_name);
            return `<option value="${this.escapeHtml(r.role_id)}" data-name="${nome}">${nome}</option>`;
        }).join('');
        document.getElementById('roleSelect').innerHTML = html;
        document.getElementById('top1Select').innerHTML = `<option value="">-- Nenhum --</option>` + html;
        document.getElementById('cargoEntradaSelect').innerHTML = `<option value="">-- Selecionar cargo --</option>` + html;
    },

    renderChannels(canais) {
        const opts = canais.map(c => `<option value="${this.escapeHtml(c.channel_id)}"># ${this.escapeHtml(c.channel_name)}</option>`).join('');
        document.getElementById('channelSelect').innerHTML = `<option value="">-- Selecionar Canal --</option>` + opts;
        document.getElementById('boostChannel').innerHTML = `<option value="">-- Nenhum --</option>` + opts;
        document.getElementById('boasVindasChannel').innerHTML = `<option value="">-- Nenhum --</option>` + opts;
        const ytSel = document.getElementById('youtubeDiscordChannel');
        if (ytSel) ytSel.innerHTML = `<option value="">-- Selecionar canal --</option>` + opts;
        const twSel = document.getElementById('twitchDiscordChannel');
        if (twSel) twSel.innerHTML = `<option value="">-- Selecionar canal --</option>` + opts;
    },

    renderTable(patentes) {
        const body = document.getElementById('patenteBody');
        body.innerHTML = '';
        patentes.sort((a, b) => a.level_required - b.level_required);
        patentes.forEach((patente, index) => {
            const row = document.createElement('tr');
            row.dataset.id = patente.id;
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>Level ${patente.level_required}</td>
                <td>${this.escapeHtml(patente.role_name || 'N/A')}</td>
                <td>${this.idCopiavel(patente.role_id)}</td>
                <td style="display:flex; gap:8px;">
                    <button class="btn-table-action secondary" onclick="app.handleEdit('${patente.id}', ${patente.level_required}, '${patente.role_id}')">✏️ Editar</button>
                    <button class="btn-table-action danger" onclick="app.handleDelete('${patente.id}')">Excluir</button>
                </td>
            `;
            body.appendChild(row);
        });
    },

    handleEdit(id, levelAtual, roleIdAtual) {
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (!row) return;

        const sel = document.getElementById('roleSelect');
        const opcoesRoles = Array.from(sel.options).map(o =>
            `<option value="${this.escapeHtml(o.value)}" ${o.value === roleIdAtual ? 'selected' : ''}>${this.escapeHtml(o.text)}</option>`
        ).join('');

row.innerHTML = `
            <td colspan="4" style="padding: 10px 20px;">
                <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
					<div style="display: flex; flex-direction: column;">
						<label style="font-size: 11px;">NÍVEL</label>
						<input type="number" id="edit-lvl-${id}" value="${levelAtual}" style="width: 80px; margin-top: 4px;">
					</div>

					<div style="display: flex; flex-direction: column; flex-grow: 1;">
						<label style="font-size: 11px;">CARGO</label>
						<select id="edit-role-${id}" style="width: 100%; margin-top: 4px;">${opcoesRoles}</select>
					</div>
                </div>
            </td>
            <td style="display:flex; gap:8px; padding-top:22px;">
                <button class="btn-table-action success" onclick="app.handleSaveEdit('${id}')">✅ Salvar</button>
                <button class="btn-table-action secondary" onclick="app.fetchAndRender(app.selectedGuild)">✖ Cancelar</button>
            </td>
        `;
    },

    async handleSaveEdit(id) {
        const lvl = document.getElementById(`edit-lvl-${id}`).value;
        const sel = document.getElementById(`edit-role-${id}`);
        const roleId = sel.value;
        const roleName = sel.options[sel.selectedIndex].text;

        if (!lvl) return this.showToast("Informe o nível.", "error");

        try {
            const { error } = await sb.from('patentes').update({
                level_required: parseInt(lvl),
                role_id: roleId,
                role_name: roleName
            }).eq('id', id);

            if (error) throw error;
            this.showToast("✅ Patente atualizada!");
            this.fetchAndRender(this.selectedGuild);
        } catch (e) {
            this.showToast("❌ Erro ao salvar.", "error");
        }
    },

    renderLeaderboard(usuarios) {
        const filtro = document.getElementById('searchLeaderboard')?.value.toLowerCase() || '';
        const filtrados = filtro
            ? usuarios.filter(u =>
                (u.username || '').toLowerCase().includes(filtro) ||
                (u.user_id || '').includes(filtro))
            : usuarios;

        const PAGE_SIZE = 20;
        const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
        if (this._leaderboardPage > totalPaginas) this._leaderboardPage = totalPaginas;
        if (this._leaderboardPage < 1) this._leaderboardPage = 1;

        const inicio = (this._leaderboardPage - 1) * PAGE_SIZE;
        const pagina = filtrados.slice(inicio, inicio + PAGE_SIZE);

        const coresXP = { 0: 'var(--gold)', 1: 'var(--silver)', 2: 'var(--bronze)' };

        document.getElementById('leaderboardBody').innerHTML = pagina.map((u, iLocal) => {
            const i = inicio + iLocal; // posição real no ranking geral, não só na página
            const topClass = i < 3 ? `top-${i + 1}` : '';
            const xpNecessario = (parseInt(u.level) * 100) + 75;
            const xpAtual = parseInt(u.xp);
            const porcentagem = Math.min(Math.max((xpAtual / xpNecessario) * 100, 0), 100).toFixed(0);
            const corBarra = coresXP[i] || 'var(--accent)';

            return `
                <tr class="${topClass}">
                    <td>${i + 1}</td>
                    <td><b>${this.escapeHtml(u.username || 'Desconhecido')}</b></td>
                    <td>Lvl ${u.level}</td>
                    <td>
                        <span style="font-size: 11px; color: var(--text-muted);">${xpAtual} / ${xpNecessario} XP (${porcentagem}%)</span>
                        <div class="xp-bar-container" style="margin-top: 4px;">
                            <div class="xp-bar-fill" style="width: ${porcentagem}%; background: ${corBarra}; box-shadow: 0 0 8px ${corBarra};"></div>
                        </div>
                    </td>
                    <td>${u.msg_count}</td>
                    <td>${this.formatarVoz(u.voice_minutes)}</td>
                    <td>${(this._conquistasUsuario && this._conquistasUsuario[u.user_id]) || 0}</td>
                </tr>
            `;
        }).join('');

        this.renderLeaderboardPagination(filtrados.length, totalPaginas);
    },

    renderLeaderboardPagination(totalItens, totalPaginas) {
        const el = document.getElementById('leaderboardPagination');
        if (!el) return;

        if (totalPaginas <= 1) { el.innerHTML = ''; return; }

        el.innerHTML = `
            <button class="secondary" style="padding:8px 14px; margin:0; ${this._leaderboardPage === 1 ? 'opacity:0.4; cursor:not-allowed;' : ''}" onclick="app.mudarPaginaLeaderboard(-1)" ${this._leaderboardPage === 1 ? 'disabled' : ''}>‹ Anterior</button>
            <span style="color:var(--text-muted); font-size:13px;">Página ${this._leaderboardPage} de ${totalPaginas} (${totalItens} membros)</span>
            <button class="secondary" style="padding:8px 14px; margin:0; ${this._leaderboardPage === totalPaginas ? 'opacity:0.4; cursor:not-allowed;' : ''}" onclick="app.mudarPaginaLeaderboard(1)" ${this._leaderboardPage === totalPaginas ? 'disabled' : ''}>Próxima ›</button>
        `;
    },

    mudarPaginaLeaderboard(delta) {
        this._leaderboardPage += delta;
        this.renderLeaderboard(this._lastLeaderboard);
    },

    renderEstatisticas(usuarios) {
        if (!usuarios.length) return;
        const totalMsgs  = usuarios.reduce((acc, u) => acc + (u.msg_count || 0), 0);
        const totalVoz   = usuarios.reduce((acc, u) => acc + (u.voice_minutes || 0), 0);
        const maxLevel   = Math.max(...usuarios.map(u => u.level));
        const maisAtivo  = usuarios.reduce((a, b) => (a.msg_count > b.msg_count ? a : b));

        document.getElementById('stat-mensagens').innerText = totalMsgs.toLocaleString('pt-BR');
        document.getElementById('stat-voz').innerText = this.formatarVoz(totalVoz);
        document.getElementById('stat-maxlevel').innerText = maxLevel;
        document.getElementById('stat-ativo').innerText = maisAtivo.username || 'N/A';
    },

    async renderXpServidorGrafico(guildId) {
        const container = document.getElementById('servidorXpGrafico');
        if (!container) return;

        const data = await NZKAPI.getXpHistoricoServidor(guildId);

        if (!data.length) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">Ainda sem histórico — o snapshot roda 1x por dia, à meia-noite.</p>';
            return;
        }

        const labels = data.map(r => r.registrado_em.slice(0, 10));
        const valores = data.map(r => r.xp_total);

        const canvas = document.createElement('canvas');
        canvas.id = 'servidorXpChart';
        canvas.style.width = '100%';
        canvas.style.maxHeight = '260px';
        container.innerHTML = '';
        container.appendChild(canvas);

        if (window._servidorXpChartInstance) {
            window._servidorXpChartInstance.destroy();
        }

        window._servidorXpChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'XP total do servidor',
                    data: valores,
                    borderColor: '#23a559',
                    backgroundColor: 'rgba(35, 165, 89, 0.15)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: '#b5bac1', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#b5bac1', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    },

    sortLeaderboard(col) {
        this._leaderboardPage = 1;
        if (this._sortLeaderboard.col === col) {
            this._sortLeaderboard.asc = !this._sortLeaderboard.asc;
        } else {
            this._sortLeaderboard.col = col;
            this._sortLeaderboard.asc = false;
        }
        const sorted = [...this._lastLeaderboard].sort((a, b) => {
            const asc = this._sortLeaderboard.asc ? 1 : -1;
            if (col === 'level') return (a.level - b.level) * asc;
            if (col === 'xp')    return (a.xp - b.xp) * asc;
            if (col === 'msg')   return ((a.msg_count || 0) - (b.msg_count || 0)) * asc;
            if (col === 'voz')   return ((a.voice_minutes || 0) - (b.voice_minutes || 0)) * asc;
            return 0;
        });
        this.renderLeaderboard(sorted);
    },

    async handleSaveChannel() {
        if (!(await this.confirmar("Confirmar alteração do canal de avisos?", "Confirmar"))) return;
        const res = await NZKAPI.salvarConfigCanal(this.selectedGuild, document.getElementById('channelSelect').value);
        if (res.success) this.showToast("✅ Canal de avisos salvo!");
        else this.showToast("❌ Erro ao salvar canal.", "error");
    },

    async handleSaveTop1() {
        if (!(await this.confirmar("Confirmar alteração do cargo Top 1?", "Confirmar"))) return;
        const res = await NZKAPI.salvarConfigTop1(this.selectedGuild, document.getElementById('top1Select').value);
        if (res.success) this.showToast("⭐ Cargo de líder definido!");
        else this.showToast("❌ Erro ao salvar cargo.", "error");
    },

    async handleSave() {
        const lvl = document.getElementById('lvl').value;
        const sel = document.getElementById('roleSelect');
        if (!lvl || isNaN(lvl)) return this.showToast("Insira um nível válido.", "error");

        const res = await NZKAPI.salvarPatente({
            guild_id: this.selectedGuild,
            level_required: parseInt(lvl),
            role_id: sel.value,
            role_name: sel.options[sel.selectedIndex].getAttribute('data-name')
        });

        if (res.success) {
            this.showToast("🛡️ Patente adicionada!");
            document.getElementById('lvl').value = "";
            this.fetchAndRender(this.selectedGuild);
        } else {
            this.showToast("❌ Erro ao adicionar patente.", "error");
        }
    },

    async handleDelete(id) {
        if (await this.confirmar("Deseja realmente excluir esta patente?", "Excluir")) {
            const res = await NZKAPI.deletarPatente(id);
            if (res.success) {
                this.showToast("🗑️ Patente removida.");
                this.fetchAndRender(this.selectedGuild);
            }
        }
    },

    async renderConquistasTable(guildId) {
        const body = document.getElementById('conquistasBody');
        if (!body) return;

        const [conquistas, contagem] = await Promise.all([
            NZKAPI.getConquistas(guildId),
            NZKAPI.getConquistasContagem(guildId)
        ]);

        const rotulosCriterio = {
            msg_count: "💬 mensagens",
            voice_minutes: "🎙️ min. de voz",
            reacoes: "❤️ reações",
            level: "📈 nível"
        };

        if (!conquistas.length) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Nenhuma conquista configurada ainda.</td></tr>';
            return;
        }

        body.innerHTML = conquistas.map(c => {
            const rotulo = rotulosCriterio[c.criterio_tipo] || c.criterio_tipo;
            const qtd = contagem[c.id] || 0;
            return `
                <tr>
                    <td style="font-size:20px; text-align:center;">${this.escapeHtml(c.emoji || '🏆')}</td>
                    <td>
                        <b>${this.escapeHtml(c.nome)}</b>
                        ${c.descricao ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${this.escapeHtml(c.descricao)}</div>` : ''}
                    </td>
                    <td>≥ ${c.criterio_valor} ${this.escapeHtml(rotulo)}</td>
                    <td>${qtd} ${qtd === 1 ? 'membro' : 'membros'}</td>
                    <td><button class="btn-table-action danger" onclick="app.handleDeletarConquista('${this.escapeHtml(c.id)}')">Excluir</button></td>
                </tr>
            `;
        }).join('');
    },

    async handleAdicionarConquista() {
        const emoji = document.getElementById('conquistaEmoji').value.trim() || '🏆';
        const nome = document.getElementById('conquistaNome').value.trim();
        const descricao = document.getElementById('conquistaDescricao').value.trim();
        const criterioTipo = document.getElementById('conquistaCriterioTipo').value;
        const criterioValor = document.getElementById('conquistaCriterioValor').value;

        if (!nome) return this.showToast("Informe o nome da conquista.", "error");
        if (!criterioValor || parseInt(criterioValor) <= 0) return this.showToast("Informe um valor de critério válido.", "error");

        const res = await NZKAPI.salvarConquista({
            guild_id: this.selectedGuild,
            emoji,
            nome,
            descricao: descricao || null,
            criterio_tipo: criterioTipo,
            criterio_valor: parseInt(criterioValor)
        });

        if (res.success) {
            this.showToast("🎖️ Conquista adicionada!");
            document.getElementById('conquistaEmoji').value = "";
            document.getElementById('conquistaNome').value = "";
            document.getElementById('conquistaDescricao').value = "";
            document.getElementById('conquistaCriterioValor').value = "";
            this.renderConquistasTable(this.selectedGuild);
        } else {
            this.showToast("❌ Erro ao adicionar conquista.", "error");
        }
    },

    async handleDeletarConquista(id) {
        if (!(await this.confirmar("Excluir esta conquista? Quem já desbloqueou perde o selo.", "Excluir"))) return;
        const res = await NZKAPI.deletarConquista(id);
        if (res.success) {
            this.showToast("🗑️ Conquista removida.");
            this.renderConquistasTable(this.selectedGuild);
        } else {
            this.showToast("❌ Erro ao excluir conquista.", "error");
        }
    },

    async refreshData() {
        await this.fetchAndRender(this.selectedGuild);
    },


    async loadHistorico() {
        const sel = document.getElementById('historicoSelect');
        const userId = sel.value;
        const userName = sel.options[sel.selectedIndex].text;
        if (!userId) return;

        document.getElementById('historicoGrafico').innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:40px;">Carregando...</p>';
        document.getElementById('historicoTabela').innerHTML = '';

        const data = await NZKAPI.getHistorico(this.selectedGuild, userId);

        if (!data.length) {
            document.getElementById('historicoGrafico').innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:40px;">Nenhum histórico encontrado nos últimos 30 dias.<br><small>O snapshot roda todo dia à meia-noite.</small></p>';
            return;
        }

        // --- GRÁFICO ---
        const labels = data.map(r => r.registrado_em.slice(0, 10));
        const valores = data.map(r => r.xp_total);

        const canvas = document.createElement('canvas');
        canvas.id = 'historicoChart';
        canvas.style.width = '100%';
        canvas.style.maxHeight = '280px';
        document.getElementById('historicoGrafico').innerHTML = '';
        document.getElementById('historicoGrafico').appendChild(canvas);

        if (window._historicoChartInstance) {
            window._historicoChartInstance.destroy();
        }

        window._historicoChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'XP',
                    data: valores,
                    borderColor: '#5865f2',
                    backgroundColor: 'rgba(88, 101, 242, 0.15)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#b5bac1', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#b5bac1', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });

        // --- TABELA ---
        const linhas = data.map((row, i) => {
            const data_fmt = row.registrado_em.slice(0, 10);
            const xp = row.xp_total;
            const delta = i === 0 ? '' : (() => {
                const d = xp - data[i - 1].xp_total;
                return d >= 0
                    ? `<span style="color:var(--success)">+${d}</span>`
                    : `<span style="color:var(--danger)">${d}</span>`;
            })();
            return `<tr>
                <td>${data_fmt}</td>
                <td><b>${xp} XP</b></td>
                <td>${delta}</td>
            </tr>`;
        }).reverse().join('');

        document.getElementById('historicoTabela').innerHTML = linhas;
    },

    renderHistoricoSelect(usuarios) {
        const sel = document.getElementById('historicoSelect');
        sel.innerHTML = '<option value="">-- Selecionar membro --</option>' +
            usuarios.map(u => `<option value="${this.escapeHtml(u.user_id)}">${this.escapeHtml(u.username || u.user_id)}</option>`).join('');
    },

    closeEditor() {
        window.scrollTo({ top: 0, behavior: 'instant' });
        this.pararRealtime();
        this.pararRealtimeAuditLog();
        document.getElementById('editor').style.display = 'none';
        document.getElementById('selector').style.display = 'block';

        const painelSuporte = document.getElementById('suporteModoPanel');
        if (painelSuporte && app._souDono) painelSuporte.style.display = 'block';

        // Sempre volta pro painel inicial, independente de quantos servidores
        // foram abertos/trocados nessa sessão — history.back() dependia do
        // histórico acumulado (cada troca de servidor empilha um estado novo
        // via pushState em loadConfig), então "Voltar" podia cair no servidor
        // anterior em vez do painel. replaceState reseta a URL pra raiz sem
        // empilhar mais um passo de histórico.
        history.replaceState({ page: "home" }, "", window.location.pathname);
    },

    switchTab(e, id) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).style.display = 'block';
        e.currentTarget.classList.add('active');

        // O gráfico do servidor só pode ser criado com o container já visível
        // (Chart.js calcula largura/altura como 0 se o pai estiver display:none) —
        // por isso ele é renderizado aqui, na hora de abrir a aba, não no load.
        if (id === 'tab-ranking' && this.selectedGuild) {
            this.renderXpServidorGrafico(this.selectedGuild);
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    history.replaceState({ page: "home" }, "", "");
    // app.init() agora é chamado pelo auth.js, só depois do login confirmado
});

window.addEventListener("popstate", (event) => {
    if (!event.state || event.state.page === "home") {
        document.getElementById('selector').style.display = 'block';
        document.getElementById('editor').style.display = 'none';

        const painelSuporte = document.getElementById('suporteModoPanel');
        if (painelSuporte && app._souDono) painelSuporte.style.display = 'block';
    }
});