/* js/dashboard.js */

const app = {
    selectedGuild: "",
    selectedGuildName: "",
    _lastLeaderboard: [],
    _sortLeaderboard: { col: null, asc: true },

    async init() {
        try {
            const servidores = await NZKAPI.getServidoresAtivos();
            this.renderServerList(servidores);
        } catch (err) {
            document.getElementById('serverList').innerHTML = "<p>Erro ao conectar à base de dados.</p>";
        }
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
        const list = document.getElementById('serverList');

        const guildData = {
            "602623690206609418": { name: "Nazarick", icon: "img/nazarick.gif" },
            "1044253947751309372": { name: "Serv Baharuth", icon: "img/baharuth.png" },
            "1089351461588176908": { name: "Serv Teocracia Slane", icon: "img/slane.png" },
            "100000000": { name: "Test Server", icon: "🧪" }
        };

        const priorityOrder = [
            "602623690206609418",
            "1044253947751309372",
            "1089351461588176908"
        ];

        servidores.sort((a, b) => {
            const indexA = priorityOrder.indexOf(a.id);
            const indexB = priorityOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            const nameA = (guildData[a.id]?.name || "").toLowerCase();
            const nameB = (guildData[b.id]?.name || "").toLowerCase();
            return nameA.localeCompare(nameB);
        });

        list.innerHTML = servidores.map(srv => {
            const id = srv.id;
            const server = guildData[id] || { name: "Servidor Ativo", icon: "🏰" };
            const removido = srv.removido_em;
            const diasRemovido = removido
                ? Math.floor((Date.now() - new Date(removido)) / 86400000)
                : null;

            return `
                <div class="server-card ${removido ? 'server-card-removido' : ''}" onclick="app.loadConfig('${id}', '${server.name}')">
                    <div class="icon-wrapper">
                        ${server.icon.includes('/')
                            ? `<img src="${server.icon}?t=${Date.now()}" class="server-icon-img">`
                            : `<span class="server-icon">${server.icon}</span>`}
                    </div>
                    <h3>${server.name}</h3>
                    <code>${id}</code>
                    ${removido ? `<div class="server-removido-badge">⚠️ Bot removido há ${diasRemovido}d</div>` : ''}
                </div>
            `;
        }).join('');
    },

    async loadConfig(guildId, guildName) {
        this.selectedGuild = guildId;
        this.selectedGuildName = guildName;

        history.pushState({ page: "editor", guildId }, "", `#server-${guildId}`);

        document.getElementById('selector').style.display = 'none';
        document.getElementById('editor').style.display = 'block';
        document.getElementById('serverTitle').innerText = "🏰 Painel: " + guildName;

        const statusSection = document.getElementById('statusSection');
        statusSection.style.display = guildId === "602623690206609418" ? "block" : "none";

        this.showLoading('patenteBody');
        this.showLoading('leaderboardBody');

        await this.fetchAndRender(guildId);
    },

    async fetchAndRender(guildId) {
        this.showLoading('patenteBody');
        this.showLoading('leaderboardBody');

        const data = await Promise.all([
            NZKAPI.getCargos(guildId),
            NZKAPI.getPatentes(guildId),
            NZKAPI.getLeaderboard(guildId),
            NZKAPI.getCanais(guildId)
        ]);

        this.renderRoles(data[0]);
        this.renderChannels(data[3]);
        this.renderTable(data[1]);
        this._lastLeaderboard = data[2];
        this.renderLeaderboard(data[2]);
        this.renderEstatisticas(data[2]);
        this.renderHistoricoSelect(data[2]);

        // Popula selects da aba Admin
        const opts = '<option value="">-- Selecionar membro --</option>' +
            data[2].map(u => `<option value="${u.user_id}">${u.username || u.user_id}</option>`).join('');
        ['resetUsuario', 'editUsuario'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) { const cur = sel.value; sel.innerHTML = opts; if (cur) sel.value = cur; }
        });
        await this.loadSavedConfigs(guildId);
        await this.renderYoutubeMonitores(guildId);
    },

    async loadSavedConfigs(guildId) {
        const config = await NZKAPI.getConfigs(guildId);
        if (config) {
            if (config.canal_avisos_id) document.getElementById('channelSelect').value = config.canal_avisos_id;
            if (config.cargo_top1_id) document.getElementById('top1Select').value = config.cargo_top1_id;
            if (config.status_texto) document.getElementById('statusInput').value = config.status_texto;
            if (config.tipo_atividade !== null) document.getElementById('statusType').value = config.tipo_atividade;
            document.getElementById('levelupMensagem').value = config.levelup_mensagem || '';
            document.getElementById('bonusBooster').value = config.bonus_booster || 0;
            if (config.canal_boost_id) document.getElementById('boostChannel').value = config.canal_boost_id;
            if (config.canal_boas_vindas_id) document.getElementById('boasVindasChannel').value = config.canal_boas_vindas_id;
            document.getElementById('boasVindasMensagem').value = config.boas_vindas_mensagem || '';
            // Marca os cargos de entrada salvos
            const cargosEntrada = config.cargos_entrada || [];
            const cargoSel = document.getElementById('cargoEntrada');
            if (cargoSel) {
                Array.from(cargoSel.options).forEach(opt => {
                    opt.selected = cargosEntrada.includes(opt.value);
                });
            }
            document.getElementById('boostXp').value = config.bonus_boost_xp || 0;
            document.getElementById('boostMensagem').value = config.boost_mensagem || '';
            document.getElementById('bonusAdmin').value = config.bonus_admin || 0;
            document.getElementById('bonusStack').value = config.bonus_stack === false ? "nao" : "sim";
        } else {
            document.getElementById('channelSelect').value = "";
            document.getElementById('top1Select').value = "";
            document.getElementById('statusInput').value = "";
            document.getElementById('statusType').value = "0";
            document.getElementById('levelupMensagem').value = '';
            document.getElementById('bonusBooster').value = 0;
            document.getElementById('boostChannel').value = "";
            document.getElementById('boasVindasChannel').value = "";
            document.getElementById('boasVindasMensagem').value = "";
            document.getElementById('cargoEntrada').value = "";
            document.getElementById('boostXp').value = 0;
            document.getElementById('boostMensagem').value = '';
            document.getElementById('bonusAdmin').value = 0;
            document.getElementById('bonusStack').value = "sim";
        }
    },





    async handleResetarServidor() {
        if (!confirm("⚠️ Isso vai zerar TODOS os níveis e XP do servidor. Tem certeza?")) return;
        if (!confirm("⚠️ Última confirmação — essa ação não pode ser desfeita!")) return;
        const res = await NZKAPI.resetarServidor(this.selectedGuild);
        if (res.success) this.showToast("✅ Todos os níveis foram resetados!");
        else this.showToast("❌ Erro ao resetar.", "error");
    },

    async handleResetarUsuario() {
        const sel = document.getElementById('resetUsuario');
        if (!sel.value) return this.showToast("Selecione um usuário.", "error");
        const nome = sel.options[sel.selectedIndex].text;
        if (!confirm(`⚠️ Resetar nível e XP de ${nome}?`)) return;
        const res = await NZKAPI.resetarUsuario(this.selectedGuild, sel.value);
        if (res.success) this.showToast(`✅ ${nome} resetado!`);
        else this.showToast("❌ Erro ao resetar.", "error");
    },

    async handleEditarUsuario() {
        const sel   = document.getElementById('editUsuario');
        const level = document.getElementById('editLevel').value;
        const xp    = document.getElementById('editXP').value;
        if (!sel.value) return this.showToast("Selecione um usuário.", "error");
        if (level === "" || xp === "") return this.showToast("Preencha nível e XP.", "error");
        const res = await NZKAPI.editarUsuario(this.selectedGuild, sel.value, level, xp);
        if (res.success) this.showToast(`✅ ${sel.options[sel.selectedIndex].text} atualizado!`);
        else this.showToast("❌ Erro ao editar.", "error");
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
                <td>${m.youtube_channel_name || m.youtube_channel_id}</td>
                <td><code>${m.youtube_channel_id}</code></td>
                <td>#${m.discord_channel_id}</td>
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

        // Limite de 3
        const atual = await NZKAPI.getYoutubeMonitores(this.selectedGuild);
        if (atual.length >= 3) return this.showToast("Limite de 3 canais atingido.", "error");

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
        if (!confirm("Remover este canal monitorado?")) return;
        const res = await NZKAPI.deletarYoutubeMonitor(id);
        if (res.success) {
            this.showToast("🗑️ Monitor removido.", "error");
            this.renderYoutubeMonitores(this.selectedGuild);
        }
    },

    async handleSalvarBoasVindasCanal() {
        const canal = document.getElementById('boasVindasChannel').value;
        const cargoSel = document.getElementById('cargoEntrada');
        const cargos = Array.from(cargoSel.selectedOptions).map(o => o.value);
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

    handleTestarBoasVindas() {
        const mensagem_raw = document.getElementById('boasVindasMensagem').value
            || "Bem-vindo(a) ao {servidor}, {usuario}!";
        const mensagem = mensagem_raw
            .replace("{usuario}", "**[USUÁRIO TESTE]**")
            .replace("{servidor}", this.selectedGuildName)
            .replace("{membros}", "**[Nº DE MEMBROS]**");

        const sel = document.getElementById('cargoEntrada');
        const cargoNome = sel.value
            ? sel.options[sel.selectedIndex]?.text
            : null;

        const preview = document.getElementById('boasVindasPreview');
        preview.innerHTML = `
            <div style="background:rgba(88,101,242,0.1); border:1px solid rgba(88,101,242,0.3); border-radius:10px; padding:15px; margin-top:10px;">
                <div style="font-weight:800; color:var(--accent); margin-bottom:8px;">👋 Prévia da mensagem</div>
                <div style="margin-bottom:8px;">${mensagem}</div>
                <div style="font-size:11px; color:var(--text-muted);">🖼️ Thumbnail: foto do perfil do usuário</div>
                ${cargoNome ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">🎭 Cargo atribuído: <b>${cargoNome}</b></div>` : ''}
            </div>
        `;
    },

    async handleSalvarBoostCanal() {
        const canal = document.getElementById('boostChannel').value;
        const xp    = document.getElementById('boostXp').value;
        const res   = await NZKAPI.salvarBoostCanal(this.selectedGuild, canal, xp);
        if (res.success) this.showToast("💜 Canal e XP de boost salvos!");
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
        if (!this.selectedGuild) return this.showToast("Selecione um servidor primeiro.", "error");
        const res = await NZKAPI.salvarStatusBot(this.selectedGuild, texto, tipo);
        if (res.success) {
            this.showToast("✅ Status salvo com sucesso!");
        } else {
            this.showToast("❌ Erro ao salvar status.", "error");
        }
    },

    renderRoles(cargos) {
        const html = cargos.map(r => `<option value="${r.role_id}" data-name="${r.role_name}">${r.role_name}</option>`).join('');
        document.getElementById('roleSelect').innerHTML = html;
        document.getElementById('top1Select').innerHTML = `<option value="">-- Nenhum --</option>` + html;
        document.getElementById('cargoEntrada').innerHTML = `<option value="">-- Nenhum --</option>` + html;
    },

    renderChannels(canais) {
        const opts = canais.map(c => `<option value="${c.channel_id}"># ${c.channel_name}</option>`).join('');
        document.getElementById('channelSelect').innerHTML = `<option value="">-- Selecionar Canal --</option>` + opts;
        document.getElementById('boostChannel').innerHTML = `<option value="">-- Nenhum --</option>` + opts;
        document.getElementById('boasVindasChannel').innerHTML = `<option value="">-- Nenhum --</option>` + opts;
        const ytSel = document.getElementById('youtubeDiscordChannel');
        if (ytSel) ytSel.innerHTML = `<option value="">-- Selecionar canal --</option>` + opts;
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
                <td>${patente.role_name || 'N/A'}</td>
                <td><code>${patente.role_id}</code></td>
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
            `<option value="${o.value}" ${o.value === roleIdAtual ? 'selected' : ''}>${o.text}</option>`
        ).join('');

        row.innerHTML = `
            <td colspan="4" style="padding: 10px 20px;">
                <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                    <div>
                        <label style="font-size:11px;">NÍVEL</label>
                        <input type="number" id="edit-lvl-${id}" value="${levelAtual}" style="width:80px; margin-top:4px;">
                    </div>
                    <div style="flex-grow:1;">
                        <label style="font-size:11px;">CARGO</label>
                        <select id="edit-role-${id}" style="width:100%; margin-top:4px;">${opcoesRoles}</select>
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

        const coresXP = { 0: 'var(--gold)', 1: 'var(--silver)', 2: 'var(--bronze)' };

        document.getElementById('leaderboardBody').innerHTML = filtrados.map((u, i) => {
            const topClass = i < 3 ? `top-${i + 1}` : '';
            const xpNecessario = (parseInt(u.level) * 100) + 75;
            const xpAtual = parseInt(u.xp);
            const porcentagem = Math.min(Math.max((xpAtual / xpNecessario) * 100, 0), 100).toFixed(0);
            const corBarra = coresXP[i] || 'var(--accent)';

            return `
                <tr class="${topClass}">
                    <td>${i + 1}</td>
                    <td><b>${u.username || 'Desconhecido'}</b></td>
                    <td>Lvl ${u.level}</td>
                    <td>
                        <span style="font-size: 11px; color: var(--text-muted);">${xpAtual} / ${xpNecessario} XP (${porcentagem}%)</span>
                        <div class="xp-bar-container" style="margin-top: 4px;">
                            <div class="xp-bar-fill" style="width: ${porcentagem}%; background: ${corBarra}; box-shadow: 0 0 8px ${corBarra};"></div>
                        </div>
                    </td>
                    <td>${u.msg_count}</td>
                    <td>${this.formatarVoz(u.voice_minutes)}</td>
                </tr>
            `;
        }).join('');
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

    sortLeaderboard(col) {
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
        if (!confirm("Confirmar alteração do canal de avisos?")) return;
        const res = await NZKAPI.salvarConfigCanal(this.selectedGuild, document.getElementById('channelSelect').value);
        if (res.success) this.showToast("✅ Canal de avisos salvo!");
        else this.showToast("❌ Erro ao salvar canal.", "error");
    },

    async handleSaveTop1() {
        if (!confirm("Confirmar alteração do cargo Top 1?")) return;
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
        if (confirm("Deseja realmente excluir esta patente?")) {
            const res = await NZKAPI.deletarPatente(id);
            if (res.success) {
                this.showToast("🗑️ Patente removida.", "error");
                this.fetchAndRender(this.selectedGuild);
            }
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
            usuarios.map(u => `<option value="${u.user_id}">${u.username || u.user_id}</option>`).join('');
    },

    closeEditor() {
        history.back();
    },

    switchTab(e, id) {
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).style.display = 'block';
        e.currentTarget.classList.add('active');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    history.replaceState({ page: "home" }, "", "");
    app.init();
});

window.addEventListener("popstate", (event) => {
    if (!event.state || event.state.page === "home") {
        document.getElementById('selector').style.display = 'block';
        document.getElementById('editor').style.display = 'none';
    }
});