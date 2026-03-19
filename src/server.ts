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
app.get
('/', (req, res) => {
    res.json({ message: 'Welcome to PDBot Webhook Relay', status: 'running' });
});

// Webhook Endpoint
app.post('/webhook/judit', async (req, res) => {
    res.status(200).send('Received'); // Responde rápido para evitar timeout da Judit

    try {
        const payload = req.body.payload || req.body;
        const requestId = payload.request_id || payload.origin_id; 
        if (!requestId) return;

        console.log(`[Webhook] Evento: ${payload.message || payload.response_type} | Request ID: ${requestId}`);

        if (payload.message === 'REQUEST_COMPLETED') {
            await JuditRequest.findOneAndUpdate(
                { request_id: requestId },
                { status: 'completed', updated_at: new Date() },
                { upsert: true }
            );
            return;
        }

        if (payload.response_type === 'application_error' || payload.message === 'LAWSUIT_NOT_FOUND') {
            await JuditRequest.findOneAndUpdate(
                { request_id: requestId },
                { status: 'error', updated_at: new Date() },
                { upsert: true }
            );
            return;
        }

        if (payload.response_type === 'lawsuit' && payload.response_data) {
            await JuditRequest.findOneAndUpdate(
                { request_id: requestId },
                { 
                    $push: { processos: payload.response_data },
                    $set: { updated_at: new Date() }
                },
                { upsert: true }
            );
        }
    } catch (error) {
        console.error('[Webhook] Erro no processamento:', error);
    }
});

// Forçando a porta 8083
const PORT = process.env.PORT || 8083;
app.listen(PORT, () => {
    console.log(`🚀 Relay PDBot rodando na porta ${PORT}`);
});