const currentTime = () => {
  const time = document.getElementById('time');

  const timeNow = new Date();
  time.textContent = timeNow.toLocaleString('ru-RU').replace(',', '');

  setTimeout(currentTime, 1000);
};

const fetchBusData = async () => {
  try {
    const response = await fetch('/next-departure');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching bus data: ${error}`);
  }
};

// const formatDate = date => date.toISOString().split('T')[0];
const formatDate = date => new Intl.DateTimeFormat('ru-RU').format(date);
const formatTime = date => date.toTimeString().split('T')[0].slice(0, 5);

const getRemainingSeconds = departureTime => {
  const now = new Date();
  const timeDeference = departureTime - now;
  return Math.floor(timeDeference / 1000);
};

const renderBusData = buses => {
  const tableBody = document.querySelector('#bus tbody');
  tableBody.textContent = '';

  buses.forEach(bus => {
    const row = document.createElement('tr');

    const nextDepartureDateTimeUTC = new Date(
      `${bus.nextDeparture.date}T${bus.nextDeparture.time}Z`,
    );

    const remainingSeconds = getRemainingSeconds(nextDepartureDateTimeUTC);

    const remainingTimeText = remainingSeconds < 60 ? 'Отправляется' : bus.nextDeparture.remaining;

    row.insertAdjacentHTML(
      'afterbegin',
      `<td>${bus.busNumber}</td>
      <td>${bus.startPoint} - ${bus.endPoint}</td>
      <td>${formatDate(nextDepartureDateTimeUTC)}</td>
      <td>${formatTime(nextDepartureDateTimeUTC)}</td>
      <td>${remainingTimeText}</td>`,
    );
    tableBody.append(row);
  });
};

const initWebSocket = () => {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.addEventListener('open', () => {
    console.log('WebSocket connection');
  });

  ws.addEventListener('message', event => {
    const buses = JSON.parse(event.data);
    renderBusData(buses);
  });

  ws.addEventListener('error', error => {
    console.error(`WebSocket error: ${error}`);
  });

  ws.addEventListener('close', () => {
    console.log('Server WebSocket connection close');
  });
};

const init = async () => {
  currentTime();

  const buses = await fetchBusData();
  renderBusData(buses);

  initWebSocket();
};

init();
