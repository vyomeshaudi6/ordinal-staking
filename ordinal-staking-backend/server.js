const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

let ordinals = [];
let stakedOrdinals = [];
const cache = {};

const hexToString = (hexData) => {
  const bytesData = Buffer.from(hexData, 'hex');
  return bytesData.toString('utf-8');
};

const fetchOrdinals = async (address) => {
  try {
    const response = await axios.get(`https://blockstream.info/api/address/${address}/txs`);
    const fetchOrdinalsPromises = response.data.map(async (tx) => {
      const txDetails = await axios.get(`https://blockstream.info/api/tx/${tx.txid}`);
      const inscriptionContent = [];
      txDetails.data.vout.forEach((output) => {
        if (output.scriptpubkey_type === 'op_return') {
          const hexData = output.scriptpubkey_asm.split(' ').pop();
          const decodedData = hexToString(hexData);
          inscriptionContent.push(decodedData);
        }
      });
      return {
        inscription_id: tx.txid,
        content: tx.status.confirmed ? 'Confirmed' : 'Pending',
        timestamp: new Date(tx.status.block_time * 1000),
        transaction_id: tx.txid,
        inscriptions: inscriptionContent,
      };
    });
    return await Promise.all(fetchOrdinalsPromises);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to fetch Ordinals');
  }
};

app.get('/api/ordinals/:address', async (req, res) => {
  const { address } = req.params;
  if (cache[address]) {
    return res.json(cache[address]);
  }
  try {
    const ordinalsData = await fetchOrdinals(address);
    cache[address] = ordinalsData;
    console.log(ordinalsData);
    res.json(ordinalsData);
  } catch (error) {
    if (error.response && error.response.data && error.response.data.includes('You have exceeded the number of free API requests')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to fetch Ordinals' });
  }
});

app.post('/api/stake', (req, res) => {
  const { inscription_id } = req.body;
  const ordinalIndex = ordinals.findIndex((o) => o.inscription_id === inscription_id);
  
  if (ordinalIndex > -1) {
    const [stakedOrdinal] = ordinals.splice(ordinalIndex, 1);
    stakedOrdinals.push(stakedOrdinal);
    res.json({ msg: 'Ordinal staked successfully', ordinal: stakedOrdinal });
  } else {
    res.status(404).json({ error: 'Ordinal not found' });
  }
});

app.get('/api/staked', (req, res) => {
  res.json(stakedOrdinals);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
