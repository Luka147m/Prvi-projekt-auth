document.getElementById('getDataButton').addEventListener('click', () => {
  fetch('http://localhost:3000/getdata')
    .then((response) => response.json())
    .then((data) => {
      document.getElementById('dbData').innerText = data.message;
    })
    .catch((err) => console.error(err));
});
