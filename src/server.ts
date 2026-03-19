import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Mongoose Connection
mongoose.connect(process.env.MONGO_URI as string)
    .then(() => console.log('✅ MongoDB Conectado'))
    .catch(err => console.error('❌ Erro MongoDB:', err));

const JuditRequestSchema = new mongoose.Schema({
    request_id: { type: String, required: true, unique: true },
    status: { type: String, default: 'processing' },
    processos: { type: Array, default: [] },
    updated_at: { type: Date, default: Date.now }
});
const JuditRequest = mongoose.model('JuditRequest', JuditRequestSchema);
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to PDBot Webhook Relay', status: 'running' });
});

app.post('/webhook/judit', async (req, res) => {
    // 1. Resposta rápida para a Judit não dar timeout e parar de enviar
    res.status(200).send('Received');

    try {
        const body = req.body;
        
        // 2. Extração inteligente baseada no log do webhook.site
        const requestId = body.reference_id || (body.payload && body.payload.origin_id);
        const eventType = body.event_type; // ex: "response_created", "request_completed"
        
        if (!requestId) {
            console.log(`[Webhook] ⚠️ POST ignorado (Sem Request ID)`);
            return;
        }

        console.log(`[Webhook] 📥 Evento: ${eventType} | ID: ${requestId}`);

        // 3. CAPTURA DE PROCESSOS (O JSON que você mandou cai aqui)
        if (eventType === 'response_created' && body.payload && body.payload.response_type === 'lawsuit') {
            const processoJudicial = body.payload.response_data;
            
            if (processoJudicial) {
                // Traduz o JSON cru da Judit para o formato que o seu Front-end já espera
                const processoFormatado = {
                    numero_processo: processoJudicial.code || 'N/A',
                    tribunal: processoJudicial.tribunal_acronym || 'N/A',
                    descricao: processoJudicial.classifications?.[0]?.name || processoJudicial.name || 'Ação Judicial',
                    assunto: processoJudicial.subjects?.[0]?.name || 'N/A',
                    data_distribuicao: processoJudicial.distribution_date ? new Date(processoJudicial.distribution_date).toLocaleDateString('pt-BR') : 'N/A',
                    status: 'Ativo', // A Judit crua nem sempre manda status claro aqui
                    valor_causa: processoJudicial.amount ? `R$ ${processoJudicial.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
                    partes: (processoJudicial.parties || []).map((part: any) => ({
                        nome: part.name,
                        tipo: part.person_type || part.side,
                        advogados: part.lawyers ? part.lawyers.map((adv: any) => adv.name) : []
                    }))
                };

                await JuditRequest.findOneAndUpdate(
                    { request_id: requestId },
                    { 
                        $push: { processos: processoFormatado },
                        $set: { updated_at: new Date(), status: 'processing' }
                    },
                    { upsert: true }
                );
                console.log(`[Webhook] ✅ +1 Processo salvo para o ID: ${requestId}`);
            }
        }

        // 4. CAPTURA DO SINAL DE TÉRMINO
        // A Judit dispara um event_type específico quando o crawler termina tudo
        if (eventType === 'request_completed' || eventType === 'request_failed') {
            await JuditRequest.findOneAndUpdate(
                { request_id: requestId },
                { status: eventType === 'request_completed' ? 'completed' : 'error', updated_at: new Date() },
                { upsert: true }
            );
            console.log(`[Webhook] 🏁 Busca finalizada (Status: ${eventType}) para o ID: ${requestId}`);
        }

    } catch (error) {
        console.error('[Webhook] ❌ Erro crítico no processamento:', error);
    }
});

// Forçando a porta 8083
const PORT = process.env.PORT || 8083;
app.listen(PORT, () => {
    console.log(`🚀 Relay PDBot rodando na porta ${PORT}`);
});