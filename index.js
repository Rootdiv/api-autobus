import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { DateTime } from 'luxon';

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
  const [hours, minutes] = firstDepartureTime.split(':').map(Number);

  let departure = DateTime.now().set({ hours, minutes }).setZone(timeZone);

  if (now > departure) {
    departure = departure.plus({ minutes: frequencyMinutes });
  }

  const endOfDay = DateTime.now().set({ hours: 23, minutes: 59 }).setZone(timeZone);

  if (now > endOfDay) {
    departure = departure
      .startOf('day')
      .plus({ days: 1 })
      .set({ hours, minutes })
      .setZone(timeZone);
  }

  while (now > departure) {
    departure = departure.plus({ minutes: frequencyMinutes });

    if (now > endOfDay) {
      departure = departure
        .startOf('day')
        .plus({ days: 1 })
        .set({ hours, minutes })
        .setZone(timeZone);
    }
  }

  return departure;
};

const sendUpdatedData = async () => {
  const buses = await loadBases();

  const updatedBases = buses.map(bus => {
    const nextDeparture = getNextDeparture(bus.firstDepartureTime, bus.frequencyMinutes);

    return {
      ...bus,
      nextDeparture: {
        date: nextDeparture.toFormat('yyyy-MM-dd'),
        time: nextDeparture.toFormat('HH:mm:ss'),
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

app.listen(PORT, 'localhost', () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
