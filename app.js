const cta = document.getElementById('cta');
const status = document.getElementById('status');

if (cta && status) {
  cta.addEventListener('click', () => {
    status.textContent = 'Church project is running.';
  });
}
