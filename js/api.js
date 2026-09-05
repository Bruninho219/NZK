// js/api.js
var sb = supabase.createClient(CONFIG.URL, CONFIG.KEY);

var NZKAPI = {

    async logAcao(guildId, acao, targetId, detalhes) {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) return;
            const meta = session.user.user_metadata || {};
            const actorId = meta.provider_id || meta.sub;
            const actorName = meta.full_name || meta.name || 'Admin';
            const { error } = await sb.from('audit_log').insert({
                guild_id: guildId,
                actor_id: actorId,
                actor_name: actorName,
                action: acao,
                target_id: targetId || null,
                detalhes: detalhes || null
            });
            if (error) throw error;
        } catch (err) {
            console.error("Erro ao registrar log de auditoria:", err);
        }
    },

    async getAuditLog(guildId) {
        try {
            const { data, error } = await sb.from('audit_log')
                .select('*')
                .eq('guild_id', guildId)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar log de auditoria:", err);
            return [];
        }
    },

    async getServidoresAtivos() {
		try {
			const { data, error } = await sb
				.from('servidores')
				.select('guild_id, removido_em, nome_servidor, icon_url, tipo');

			if (error) throw error;

			return data.map(item => ({
				id: item.guild_id,
				removido_em: item.removido_em,
				nome_servidor: item.nome_servidor,
				icon_url: item.icon_url,
				tipo: item.tipo || 'comum'
			}));
		} catch (err) {
			console.error("Erro ao buscar servidores:", err);
			return [];
		}
	},

    async souDono() {
        try {
            const { data, error } = await sb.rpc('is_bot_owner');
            if (error) throw error;
            return !!data;
        } catch (err) {
            console.error("Erro ao verificar dono do bot:", err);
            return false;
        }
    },

    async getSuporteAtivo() {
        try {
            const { data, error } = await sb.from('suporte_acesso')
                .select('guild_id, ativado_em')
                .order('ativado_em', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar acessos de suporte:", err);
            return [];
        }
    },

    async ativarSuporte(guildId) {
        try {
            const { error } = await sb.from('suporte_acesso').upsert({ guild_id: guildId });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao ativar suporte:", err);
            return { success: false };
        }
    },

    async desativarSuporte(guildId) {
        try {
            const { error } = await sb.from('suporte_acesso').delete().eq('guild_id', guildId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao desativar suporte:", err);
            return { success: false };
        }
    },

    async getCargos(guildId) {
        try {
            const { data, error } = await sb.from('servidor_cargos')
                .select('role_id, role_name')
                .eq('guild_id', guildId)
                .order('posicao', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar cargos:", err);
            return [];
        }
    },

    async getCanais(guildId) {
        try {
            const { data, error } = await sb.from('servidor_canais')
                .select('channel_id, channel_name')
                .eq('guild_id', guildId)
                .order('posicao', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar canais:", err);
            return [];
        }
    },

    async getPatentes(guildId) {
        try {
            const { data, error } = await sb.from('patentes').select('*').eq('guild_id', guildId);
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar patentes:", err);
            return [];
        }
    },

    async getLeaderboard(guildId) {
        try {
            const { data, error } = await sb.from('niveis')
                .select('user_id, xp, level, msg_count, voice_minutes, reacoes, usuarios(username)')
                .eq('guild_id', guildId)
                .order('level', { ascending: false })
                .order('xp', { ascending: false });
            if (error) throw error;
            return (data || []).map(u => ({
                ...u,
                username: u.usuarios?.username || 'Desconhecido'
            }));
        } catch (err) {
            console.error("Erro ao buscar ranking:", err);
            return [];
        }
    },

    async getConfigs(guildId) {
        try {
            const { data, error } = await sb.from('servidor_configs').select('*').eq('guild_id', guildId).maybeSingle();
            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Erro ao buscar configs:", err);
            return null;
        }
    },

    async salvarStatusBot(guildId, textoStatus, tipoAtividade, expiraEm) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId,
                status_texto: textoStatus,
                tipo_atividade: parseInt(tipoAtividade),
                status_expira_em: expiraEm
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar status:", err);
            return { success: false };
        }
    },

    async salvarConfigCanal(guildId, channelId) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId, canal_avisos_id: channelId
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar canal:", err);
            return { success: false };
        }
    },

    async salvarConfigTop1(guildId, roleId) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId, cargo_top1_id: roleId || null
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar top1:", err);
            return { success: false };
        }
    },

    async salvarLevelupMensagem(guildId, mensagem) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId, levelup_mensagem: mensagem || null
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar mensagem levelup:", err);
            return { success: false };
        }
    },

    async salvarBonus(guildId, bonusBooster, bonusAdmin, bonusStack) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId,
                bonus_booster: parseInt(bonusBooster) || 0,
                bonus_admin: parseInt(bonusAdmin) || 0,
                bonus_stack: bonusStack
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar bonus:", err);
            return { success: false };
        }
    },

    async salvarXpConfig(guildId, xpMensagem, xpReacao, xpVozMinuto) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId,
                xp_mensagem: parseInt(xpMensagem) || 0,
                xp_reacao: parseInt(xpReacao) || 0,
                xp_voz_minuto: parseInt(xpVozMinuto) || 0
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar config de XP:", err);
            return { success: false };
        }
    },

    async salvarCooldowns(guildId, cooldownMensagem, cooldownReacao) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId,
                cooldown_mensagem_segundos: parseInt(cooldownMensagem) || 15,
                cooldown_reacao_segundos: parseInt(cooldownReacao) || 5
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar cooldowns:", err);
            return { success: false };
        }
    },

    async salvarBoostCanal(guildId, canalBoostId, bonusBoostXp, afetaBonusAdmin) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId,
                canal_boost_id: canalBoostId || null,
                bonus_boost_xp: parseInt(bonusBoostXp) || 0,
                boost_afeta_bonus_admin: afetaBonusAdmin
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar boost canal:", err);
            return { success: false };
        }
    },

    async salvarBoostMensagem(guildId, boostMensagem) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId, boost_mensagem: boostMensagem || null
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar boost mensagem:", err);
            return { success: false };
        }
    },

    async salvarBoasVindasCanal(guildId, canalId, cargosEntradaIds) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId,
                canal_boas_vindas_id: canalId || null,
                cargos_entrada: cargosEntradaIds || []
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar boas-vindas canal:", err);
            return { success: false };
        }
    },

    async salvarBoasVindasMensagem(guildId, mensagem) {
        try {
            const { error } = await sb.from('servidor_configs').upsert({
                guild_id: guildId, boas_vindas_mensagem: mensagem || null
            }, { onConflict: 'guild_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar boas-vindas mensagem:", err);
            return { success: false };
        }
    },

    async salvarPatente(payload) {
        try {
            const { error } = await sb.from('patentes').insert([payload]);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar patente:", err);
            return { success: false };
        }
    },

    async deletarPatente(id) {
        try {
            const { error } = await sb.from('patentes').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao deletar patente:", err);
            return { success: false };
        }
    },

    async getConquistas(guildId) {
        try {
            const { data, error } = await sb.from('conquistas').select('*').eq('guild_id', guildId);
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar conquistas:", err);
            return [];
        }
    },

    async salvarConquista(payload) {
        try {
            const { error } = await sb.from('conquistas').insert([payload]);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar conquista:", err);
            return { success: false };
        }
    },

    async deletarConquista(id) {
        try {
            const { error } = await sb.from('conquistas').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao deletar conquista:", err);
            return { success: false };
        }
    },

    async getConquistasUsuarios(guildId) {
        // Retorna quantas conquistas cada usuário já desbloqueou nesse
        // servidor — usado pra mostrar um contador no ranking.
        try {
            const { data, error } = await sb.from('conquistas_usuario')
                .select('user_id')
                .eq('guild_id', guildId);
            if (error) throw error;
            const contagem = {};
            (data || []).forEach(row => {
                contagem[row.user_id] = (contagem[row.user_id] || 0) + 1;
            });
            return contagem;
        } catch (err) {
            console.error("Erro ao buscar conquistas dos usuários:", err);
            return {};
        }
    },

    async getConquistasContagem(guildId) {
        // Retorna quantos usuários já desbloquearam cada conquista —
        // usado na aba de gerenciamento (admin), pra saber o alcance de cada uma.
        try {
            const { data, error } = await sb.from('conquistas_usuario')
                .select('conquista_id')
                .eq('guild_id', guildId);
            if (error) throw error;
            const contagem = {};
            (data || []).forEach(row => {
                contagem[row.conquista_id] = (contagem[row.conquista_id] || 0) + 1;
            });
            return contagem;
        } catch (err) {
            console.error("Erro ao buscar contagem de conquistas:", err);
            return {};
        }
    },

    async resetarServidor(guildId) {
        try {
            const { error } = await sb.from('niveis').update({
                xp: 0, level: 0, msg_count: 0, voice_minutes: 0, reacoes: 0
            }).eq('guild_id', guildId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao resetar servidor:", err);
            return { success: false };
        }
    },

    async resetarUsuario(guildId, userId) {
        try {
            const { error } = await sb.from('niveis').update({
                xp: 0, level: 0, msg_count: 0, voice_minutes: 0, reacoes: 0
            }).eq('guild_id', guildId).eq('user_id', userId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao resetar usuario:", err);
            return { success: false };
        }
    },

    async editarUsuario(guildId, userId, level, xp) {
        try {
            const { error } = await sb.from('niveis').update({
                level: parseInt(level), xp: parseInt(xp)
            }).eq('guild_id', guildId).eq('user_id', userId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao editar usuario:", err);
            return { success: false };
        }
    },

    async getTwitchMonitores(guildId) {
        try {
            const { data, error } = await sb.from('twitch_monitores')
                .select('*').eq('guild_id', guildId).order('id', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar monitores Twitch:", err);
            return [];
        }
    },

    async salvarTwitchMonitor(payload) {
        try {
            const { error } = await sb.from('twitch_monitores').upsert(payload, { onConflict: 'guild_id,twitch_username' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar monitor Twitch:", err);
            return { success: false };
        }
    },

    async deletarTwitchMonitor(id) {
        try {
            const { error } = await sb.from('twitch_monitores').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao deletar monitor Twitch:", err);
            return { success: false };
        }
    },

    async toggleTwitchMonitor(id, ativo) {
        try {
            const { error } = await sb.from('twitch_monitores').update({ ativo }).eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao toggle monitor Twitch:", err);
            return { success: false };
        }
    },

    async getYoutubeMonitores(guildId) {
        try {
            const { data, error } = await sb.from('youtube_monitores')
                .select('*').eq('guild_id', guildId).order('id', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar monitores YouTube:", err);
            return [];
        }
    },

    async resolverYoutubeChannelId(entrada) {
        try {
            entrada = entrada.trim();
            if (entrada.includes("youtube.com")) {
                if (entrada.includes("/@")) {
                    entrada = "@" + entrada.split("/@")[1].split("/")[0];
                } else if (entrada.includes("/channel/")) {
                    return { id: entrada.split("/channel/")[1].split("/")[0], nome: null };
                } else if (entrada.includes("/user/")) {
                    entrada = entrada.split("/user/")[1].split("/")[0];
                }
            }
            if (entrada.startsWith("UC") && entrada.length > 20) {
                return { id: entrada, nome: null };
            }

            const handle = entrada.replace(/^@/, "");
            const apiKey = CONFIG.YOUTUBE_API_KEY;
            if (!apiKey) {
                console.error("YOUTUBE_API_KEY não configurada em config.js");
                return null;
            }

            const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;
            const resp = await fetch(url);
            const data = await resp.json();

            if (data.items && data.items.length > 0) {
                return { id: data.items[0].id, nome: data.items[0].snippet?.title || null };
            }
            return null;
        } catch (err) {
            console.error("Erro ao resolver canal YouTube:", err);
            return null;
        }
    },

    async salvarYoutubeMonitor(payload) {
        try {
            const { error } = await sb.from('youtube_monitores').upsert(payload, { onConflict: 'guild_id,youtube_channel_id' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao salvar monitor YouTube:", err);
            return { success: false };
        }
    },

    async deletarYoutubeMonitor(id) {
        try {
            const { error } = await sb.from('youtube_monitores').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao deletar monitor YouTube:", err);
            return { success: false };
        }
    },

    async toggleYoutubeMonitor(id, ativo) {
        try {
            const { error } = await sb.from('youtube_monitores').update({ ativo }).eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Erro ao toggle monitor YouTube:", err);
            return { success: false };
        }
    },

	async getHistorico(guildId, userId) {
		try {
			const { data, error } = await sb.rpc(
				'get_xp_historico_limitado',
				{
					p_guild_id: guildId,
					p_user_id: userId
				}
			);

			if (error) throw error;

			return data || [];
		} catch (err) {
			console.error("Erro ao buscar historico:", err);
			return [];
		}
	},

	async getXpHistoricoServidor(guildId) {
		try {
			const { data, error } = await sb.rpc(
				'get_servidor_xp_historico_limitado',
				{
					p_guild_id: guildId
				}
			);

			if (error) throw error;

			return data || [];
		} catch (err) {
			console.error("Erro ao buscar historico de XP do servidor:", err);
			return [];
		}
	},

	async getPlanosConfig() {
		try {
			const { data, error } = await sb
				.from('planos_config')
				.select('*');

			if (error) throw error;

			return data || [];
		} catch (err) {
			console.error("Erro ao buscar configurações dos planos:", err);
			return [];
		}
	},

	async salvarTipoServidor(guildId, tipo) {
		try {
			const { error } = await sb
				.from('servidores')
				.update({ tipo })
				.eq('guild_id', guildId);

			if (error) throw error;

			return { success: true };
		} catch (err) {
			console.error("Erro ao salvar tipo do servidor:", err);
			return {
				success: false,
				error: err
			};
		}
	}
};