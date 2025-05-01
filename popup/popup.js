document.addEventListener('DOMContentLoaded', () => {
  const tariffRateInput = document.getElementById('tariffRate');
  const profitMarginInput = document.getElementById('profitMargin');
  const saveButton = document.getElementById('saveButton');
  const statusMessage = document.getElementById('statusMessage');

  // Load saved settings when the popup opens
  chrome.storage.sync.get(['tariffRate', 'profitMargin'], (result) => {
    if (result.tariffRate) {
      tariffRateInput.value = result.tariffRate;
    } else {
      // Default value if nothing is saved
      tariffRateInput.value = 145; 
    }
    if (result.profitMargin) {
      profitMarginInput.value = result.profitMargin;
    } else {
       // Default value if nothing is saved
      profitMarginInput.value = 25;
    }
  });

  // Save settings when the button is clicked
  saveButton.addEventListener('click', () => {
    const tariffRate = parseFloat(tariffRateInput.value);
    const profitMargin = parseFloat(profitMarginInput.value);

    if (isNaN(tariffRate) || isNaN(profitMargin) || tariffRate < 0 || profitMargin < 0) {
        statusMessage.textContent = 'Error: Please enter valid positive numbers.';
        statusMessage.style.color = 'red';
        return;
    }

    chrome.storage.sync.set({ tariffRate, profitMargin }, () => {
      statusMessage.textContent = 'Settings saved!';
      statusMessage.style.color = 'green';
      setTimeout(() => {
        statusMessage.textContent = ''; // Clear message after a few seconds
      }, 3000);
    });
  });
});