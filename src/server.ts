import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { read } from 'node:fs';

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

// Rota de Teste de Vida
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to PDBot Webhook Relay', status: 'running' });
});

// Webhook Endpoint
app.post('/webhook/judit', async (req, res) => {
    // Responde rápido para a Judit não dar timeout
    res.status(200).send('Received');

    try {
        const body = req.body;
        console.log(`[Webhook] 🔔 Evento recebido: ${body}`);
        
        // Extrai o ID e o Evento com base na documentação real da Judit
        const requestId = body.reference_id || (body.payload && body.payload.origin_id);
        const eventType = body.event_type;
        
        if (!requestId) {
            console.log(`[Webhook] ⚠️ POST ignorado (Sem Request ID)`);
            return;
        }

        const payloadType = body.payload ? body.payload.response_type : 'desconhecido';
        console.log(`[Webhook] 📥 Evento: ${eventType} | Tipo: ${payloadType} | ID: ${requestId}`);

        // CASO 1: A Judit enviou um processo (lawsuit)
        if (eventType === 'response_created' && body.payload && body.payload.response_type === 'lawsuit') {
            const processoJudicial = body.payload.response_data;
            
            if (processoJudicial) {
                // Formata o processo para o Front-end ler sem quebrar
                const processoFormatado = {
                    numero_processo: processoJudicial.code || 'N/A',
                    tribunal: processoJudicial.tribunal_acronym || 'N/A',
                    descricao: processoJudicial.classifications?.[0]?.name || processoJudicial.name || 'Ação Judicial',
                    assunto: processoJudicial.subjects?.[0]?.name || 'N/A',
                    data_distribuicao: processoJudicial.distribution_date ? new Date(processoJudicial.distribution_date).toLocaleDateString('pt-BR') : 'N/A',
                    status: 'Ativo',
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
                        $set: { updated_at: new Date(), status: 'processing' } // Mantém processing enquanto chegam dados
                    },
                    { upsert: true }
                );
                console.log(`[Webhook] ✅ +1 Processo salvo para o ID: ${requestId}`);
            }
        }

        // CASO 2: A Judit avisou que terminou de varrer os tribunais (application_info + REQUEST_COMPLETED)
        if (eventType === 'response_created' && body.payload && body.payload.response_type === 'application_info') {
            const appInfo = body.payload.response_data;
            
            // O código 600 é a "bandeira quadriculada" da Judit
            if (appInfo && appInfo.message === 'REQUEST_COMPLETED') {
                await JuditRequest.findOneAndUpdate(
                    { request_id: requestId },
                    { status: 'completed', updated_at: new Date() },
                    { upsert: true }
                );
                console.log(`[Webhook] 🏁 Busca finalizada (Status: COMPLETED) para o ID: ${requestId}`);
            }
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