const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const axios = require('axios');
const crypto = require('crypto');
 
const pool = new Pool({
    connectionString: 'postgres://default:xxxxxxxxQqtJ@ep-throbbing-sunset-00000000.xx-xxxx-xx.aws.neon.tech:0000/verceldb?sslmode=require',
});

 

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));  


async function sendFormAutomatically(transactionData) {
    console.log("Datele:", transactionData);

    const url = "https://ecomt.victoriabank.md/cgi-bin/cgi_link?";
    const trtype = 24;

    const formData = {
        AMOUNT: transactionData[3],
        CURRENCY: transactionData[4],
        ORDER: transactionData[2],
        DESC: "Description ",
        MERCH_NAME: "Merchant Name",
        MERCH_URL: "www.test.md",
        MERCHANT: transactionData[0],
        TERMINAL: transactionData[0],
        EMAIL: "examples@test.com",
        TRTYPE: trtype,
        COUNTRY: transactionData[4],
        NONCE: transactionData[11],
        BACKREF: "http://www.test.md/",
        MERCH_GMT: "2",
        TIMESTAMP: transactionData[10],
        P_SIGN: transactionData[12],
        LANG: "en",
        MERCH_ADDRESS: "Merchant Address",
        RRN: transactionData[8],
        INT_REF: transactionData[9],
    };

    try {
        console.log("Trimitere formular catre:", url);
        const response = await axios.post(url, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        console.log("Raspuns de la server:", response.data);
    } catch (error) {
        console.error("Eroare la trimiterea formularului:", error.message);
    }
}

 

app.post('/save-data', async (req, res) => {
    try {
        console.log(req.body, 'cosole.log');
 
        const {
            TERMINAL,
            TRTYPE,
            ORDER,
            AMOUNT,
            CURRENCY,
            ACTION,
            RC,
            APPROVAL,
            RRN,
            INT_REF,
            TIMESTAMP,
            NONCE,
            P_SIGN,
            ECI,
            TEXT,
            EMAIL
        } = req.body;

        console.log(req.body, 'cosole.log222');

        const query = `
            INSERT INTO transaction (TERMINAL, TRTYPE, "ORDER", AMOUNT, CURRENCY, ACTION, RC, APPROVAL, RRN, INT_REF, TIMESTAMP, NONCE, P_SIGN, ECI, TEXT, EMAIL)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `;

        const values = [
            TERMINAL, TRTYPE, ORDER, AMOUNT, CURRENCY, ACTION, RC,
            APPROVAL, RRN, INT_REF, TIMESTAMP, NONCE, P_SIGN, ECI, TEXT, EMAIL
        ];

        await pool.query(query, values);

        // Daca TRTYPE este 0  se trimite automat o noua cerere cu TRTYPE 21
        if (TRTYPE === '0') {
            try {
                console.log("TRTYPE este 0, trimit cerere cu TRTYPE 21...");

                const newTrType = '21';
                const newNonce = crypto.randomBytes(16).toString('hex');  
                const newTimestamp = new Date().toISOString().replace(/[-:.TZ]/g, ''); //  YYMMDDhhmmss

              
                const p_sign_data = `${ORDER.length}${ORDER}${newNonce.length}${newNonce}${newTimestamp.length}${newTimestamp}${newTrType.length}${newTrType}${AMOUNT.length}${AMOUNT}`;
                const secretKey = "0652cb0fb1ba45044d549641dcf0172067ed45e844bcb2bc"; // Cheia privata HEX
                const p_sign = crypto.createHmac('sha256', Buffer.from(secretKey, 'hex')).update(p_sign_data).digest('hex');

                 
                const payload = new URLSearchParams();
                payload.append('TERMINAL', TERMINAL);
                payload.append('TRTYPE', newTrType);
                payload.append('ORDER', ORDER);
                payload.append('AMOUNT', AMOUNT);
                payload.append('CURRENCY', CURRENCY);
                payload.append('TIMESTAMP', newTimestamp);
                payload.append('NONCE', newNonce);
                payload.append('P_SIGN', p_sign);

                // Trimitem request 
                const response = await axios.post('https://ecomt.victoriabank.md/cgi-bin/cgi_link?', payload.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                console.log('Raspuns de la banca:', response.data);
            } catch (err) {
                console.error('Eroare la trimiterea către bancă:', err);
            }
        }

        res.status(200).json({ message: 'Datele au fost salvate cu succes.' });

    } catch (error) {
        console.error('Eroare la salvarea datelor:', error);
        res.status(500).json({ message: 'Eroare la salvarea datelor.', error });
    }
});


app.get('/get-data', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM transaction');
        res.status(200).json(result.rows); 
    } catch (error) {
        console.error('Eroare la obținerea datelor:', error);
        res.status(500).json({ message: 'Eroare la obținerea datelor.', error });
    }
});
 

app.post('/finalize-record', async (req, res) => {
    try {
        const { TERMINAL, ORDER, AMOUNT, CURRENCY, ACTION, RC, APPROVAL, RRN, INT_REF, TIMESTAMP, NONCE, P_SIGN, ECI, TEXT } = req.body;

        
        const checkQuery = `
            SELECT 1 FROM transaction WHERE RRN = $1 AND TRTYPE = '21'
        `;
        const checkResult = await pool.query(checkQuery, [RRN]);

        if (checkResult.rowCount > 0) {
            return res.status(400).json({ message: 'Tranzacția este deja finalizată.' });
        }

        const insertQuery = `
            INSERT INTO transaction (TERMINAL, TRTYPE, "ORDER", AMOUNT, CURRENCY, ACTION, RC, APPROVAL, RRN, INT_REF, TIMESTAMP, NONCE, P_SIGN, ECI, TEXT)
            VALUES ($1, '21', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `;

        const values = [TERMINAL, ORDER, AMOUNT, CURRENCY, ACTION, RC, APPROVAL, RRN, INT_REF, TIMESTAMP, NONCE, P_SIGN, ECI, TEXT];
        await pool.query(insertQuery, values);

        res.status(200).json({ message: 'succes.' });
    } catch (error) {
        console.error('Eroare :', error);
        res.status(500).json({ message: 'Eroare ', error });
    }
});


 


 


 

 
 

app.listen(PORT, () => {
    console.log(`Serverul rulează pe http://localhost:${PORT}`);
});
