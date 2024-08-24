import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { DateTime, Duration } from 'luxon';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 2224;
const timeZone = 'UTC';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const loadBases = async () => {
  const data = await readFile(path.join(__dirname, 'buses.json'), 'utf-8');
  return JSON.parse(data);
};

const getNextDeparture = (firstDepartureTime, frequencyMinutes) => {
  const now = DateTime.now().setZone(timeZone);
  const [hour, minute] = firstDepartureTime.split(':').map(Number);

  let departure = DateTime.now().set({ hour, minute, second: 0 }).setZone(timeZone);

  if (now > departure) {
    departure = departure.plus({ minutes: frequencyMinutes });
  }

  const endOfDay = DateTime.now().set({ hour: 23, minute: 59 }).setZone(timeZone);

  if (now > endOfDay) {
    departure = departure.startOf('day').plus({ days: 1 }).set({ hour, minute }).setZone(timeZone);
  }

  while (now > departure) {
    departure = departure.plus({ minutes: frequencyMinutes });

    if (now > endOfDay) {
      departure = departure
        .startOf('day')
        .plus({ days: 1 })
        .set({ hour, minute })
        .setZone(timeZone);
    }
  }

  return departure;
};

const sendUpdatedData = async () => {
  const buses = await loadBases();
  const now = DateTime.now().setZone(timeZone);

  const updatedBases = buses.map(bus => {
    const nextDeparture = getNextDeparture(bus.firstDepartureTime, bus.frequencyMinutes);

    const timeRemaining = Duration.fromMillis(nextDeparture.diff(now).toMillis());

    return {
      ...bus,
      nextDeparture: {
        date: nextDeparture.toFormat('yyyy-MM-dd'),
        time: nextDeparture.toFormat('HH:mm:ss'),
        remaining: timeRemaining.toFormat('hh:mm:ss'),
      },
    };
  });

  return updatedBases;
};

const sortBuses = buses =>
  [...buses].sort(
    (a, b) =>
      new Date(`${a.nextDeparture.date}T${a.nextDeparture.time}Z`) -
      new Date(`${b.nextDeparture.date}T${b.nextDeparture.time}Z`),
  );

app.get('/next-departure', async (req, res) => {
  try {
    const updatedBases = await sendUpdatedData();
    const sortedBuses = sortBuses(updatedBases);
    res.json(sortedBuses);
  } catch (error) {
    console.error(error);
    res.status(500).send('На сервере произошла ошибка, попробуйте оправить запрос позже');
  }
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

wss.on('connection', ws => {
  console.log('Client WebSocket connection');
  clients.add(ws);

  const setUpdates = async () => {
    try {
      const updatedBases = await sendUpdatedData();
      const sortedBuses = sortBuses(updatedBases);
      ws.send(JSON.stringify(sortedBuses));
    } catch (error) {
      console.error(`Error WebSocket connection: ${error}`);
    }
  };

  const intervalId = setInterval(setUpdates, 1000);

  ws.on('close', () => {
    clearInterval(intervalId);
    clients.delete(ws);
    console.log('Client WebSocket closed');
  });
});

const server = app.listen(PORT, 'localhost', () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit('connection', ws, req);
  });
});
