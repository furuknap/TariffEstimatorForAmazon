console.log("Amazon Tariff Estimator: Content script loaded.");

function findCountryOfOrigin() {
    const detailTable = document.getElementById('productDetails_detailBullets_sections1');
    if (detailTable) {
        const rows = detailTable.querySelectorAll('tr');
        for (const row of rows) {
            const header = row.querySelector('th');
            if (header && header.innerText.trim() === 'Country of Origin') {
                const valueCell = row.querySelector('td');
                return valueCell ? valueCell.innerText.trim() : null;
            }
        }
    }
    
    // Fallback search if the primary table ID isn't found or doesn't contain the info
    const detailHeaders = document.querySelectorAll('#detailBullets_feature_div th, #prodDetails th');
     for (const header of detailHeaders) {
         if (header.innerText.trim() === 'Country of Origin') {
             const valueCell = header.nextElementSibling; // Get the next sibling TD
             if (valueCell && valueCell.tagName === 'TD') {
                 return valueCell.innerText.trim();
             }
         }
     }

    return null;
}

function getPrice() {
    console.log("Amazon Tariff Estimator: Searching for price elements...");
    
    // Collect all price elements from the page
    const allPriceElements = [];
    
    // 1. Find any price element with the priceToPay class (including the reinventPricePriceToPayMargin variant)
    const priceToPayElements = document.querySelectorAll('.priceToPay');
    allPriceElements.push(...priceToPayElements);
    
    // 2. Find all other common price elements
    const priceSelectors = [
        '#corePrice_feature_div .a-price', // Main price block
        '.a-price[data-a-color="base"]', // Base colored price (often the main price)
        '#price_inside_buybox', // Inside buybox price
        '#priceblock_ourprice', // Older price block ID
        '#priceblock_dealprice', // Deal price block ID
        '.apexPriceToPay', // Another price format
        '.a-price' // Generic a-price class (will catch sidebar prices)
    ];

    for (const selector of priceSelectors) {
        const elements = document.querySelectorAll(selector);
        allPriceElements.push(...elements);
    }
    
    // Remove duplicates by converting to Set and back to Array
    const uniquePriceElements = [...new Set(allPriceElements)];
    console.log(`Amazon Tariff Estimator: Found ${uniquePriceElements.length} unique price elements`);
    
    // Extract prices from all elements
    const validPrices = [];
    
    for (const element of uniquePriceElements) {
        const result = extractPriceFromElement(element);
        if (result) {
            validPrices.push(result);
            console.log("Amazon Tariff Estimator: Found valid price:", result.value, "in element:", element.className);
        }
    }
    
    if (validPrices.length === 0) {
        console.log("Amazon Tariff Estimator: No valid price elements found.");
        return null;
    }
    
    // If we found multiple valid prices, return all of them
    if (validPrices.length > 1) {
        console.log(`Amazon Tariff Estimator: Found ${validPrices.length} valid prices, returning all of them.`);
        return {
            value: validPrices[0].value, // Use the first price value for calculations
            insertionElements: validPrices.map(p => p.insertionElement) // Return all elements for insertion
        };
    }
    
    // If we found just one price, return it
    return {
        value: validPrices[0].value,
        insertionElement: validPrices[0].insertionElement,
        insertionElements: [validPrices[0].insertionElement] // Also provide as array for consistency
    };
}

// Helper function to extract price from an element using various methods
function extractPriceFromElement(element) {
    console.log("Amazon Tariff Estimator: Attempting to extract price from element:", element.className);
    
    // Method 1: Try to get price from .a-offscreen (most common)
    const offscreenElement = element.querySelector('.a-offscreen');
    if (offscreenElement && offscreenElement.innerText.trim()) {
        const priceText = offscreenElement.innerText.trim().replace(/[^0-9.]/g, '');
        const price = parseFloat(priceText);
        if (!isNaN(price) && price > 0) {
            return { value: price, insertionElement: element };
        }
    }
    
    // Method 2: Try to get price from whole + fraction parts
    const wholeElement = element.querySelector('.a-price-whole');
    const fractionElement = element.querySelector('.a-price-fraction');
    if (wholeElement && fractionElement) {
        const whole = wholeElement.innerText.trim().replace(/[^0-9]/g, '');
        const fraction = fractionElement.innerText.trim().replace(/[^0-9]/g, '');
        if (whole && fraction) {
            const priceText = `${whole}.${fraction}`;
            const price = parseFloat(priceText);
            if (!isNaN(price) && price > 0) {
                return { value: price, insertionElement: element };
            }
        }
    }
    
    // Method 3: Try to extract from the element's own text content
    if (element.innerText) {
        // Extract numbers with decimal point from the text
        const priceMatch = element.innerText.match(/\$?(\d+(?:\.\d+)?)/);
        if (priceMatch && priceMatch[1]) {
            const price = parseFloat(priceMatch[1]);
            if (!isNaN(price) && price > 0) {
                return { value: price, insertionElement: element };
            }
        }
    }
    
    // No price found in this element
    return null;
}


function calculateTariff(price, tariffRatePercent, profitMarginPercent) {
    // Formula derivation:
    // Price = Cost * (1 + ProfitMargin) * (1 + TariffRate)
    // Cost = Price / ((1 + ProfitMargin) * (1 + TariffRate))
    // TariffAmount = Cost * TariffRate
    // TariffAmount = (Price / ((1 + ProfitMargin) * (1 + TariffRate))) * TariffRate

    const tariffRate = tariffRatePercent / 100;
    const profitMargin = profitMarginPercent / 100;

    if ((1 + profitMargin) * (1 + tariffRate) === 0) {
        return 0; // Avoid division by zero
    }

    const cost = price / ((1 + profitMargin) * (1 + tariffRate));
    const tariffAmount = cost * tariffRate;

    return tariffAmount;
}

function displayTariffEstimate(tariffAmount, insertionElementOrElements) {
    // Handle both single element and array of elements
    const insertionElements = insertionElementOrElements.insertionElements ||
                             (Array.isArray(insertionElementOrElements) ? insertionElementOrElements :
                             [insertionElementOrElements]);
    
    if (insertionElements.length === 0) {
        console.log("Amazon Tariff Estimator: No insertion elements found for tariff info.");
        return;
    }

    console.log(`Amazon Tariff Estimator: Displaying tariff estimate on ${insertionElements.length} elements.`);
    
    // Display the tariff estimate on each insertion element
    for (const element of insertionElements) {
        if (!element) continue;
        
        // Remove any existing estimate first
        const existingEstimate = element.querySelector('.tariff-estimate-text');
        if (existingEstimate) {
            existingEstimate.remove();
        }

        const estimateText = document.createElement('span');
        estimateText.className = 'tariff-estimate-text a-size-base a-color-secondary'; // Use Amazon's styling classes
        estimateText.style.marginLeft = '5px'; // Add some space
        estimateText.style.fontWeight = 'normal'; // Ensure it's not bold like the price
        estimateText.innerText = `(tariff est. $${tariffAmount.toFixed(2)})`;

        element.appendChild(estimateText);
        console.log("Amazon Tariff Estimator: Tariff estimate displayed on element:", element.className);
    }
}

// Track if the estimator has already run successfully
let estimatorHasRun = false;
let lastProductUrl = '';

function runEstimator(forceRun = false) {
    // Check if we're on a new product page by comparing URLs
    const currentUrl = window.location.href;
    const isNewProduct = currentUrl !== lastProductUrl;
    
    // Only run if forced, it's a new product, or it hasn't run yet
    if (!forceRun && estimatorHasRun && !isNewProduct) {
        console.log("Amazon Tariff Estimator: Skipping run - already executed for this product.");
        return;
    }
    
    // Update the last product URL
    lastProductUrl = currentUrl;
    
    console.log("Amazon Tariff Estimator: Running estimator...");
    const country = findCountryOfOrigin();
    console.log("Amazon Tariff Estimator: Country of Origin found:", country);

    if (country && country.toLowerCase() === 'china') {
        console.log("Amazon Tariff Estimator: Product is from China.");
        const priceInfo = getPrice();

        if (priceInfo) {
            console.log("Amazon Tariff Estimator: Price found:", priceInfo.value);
            chrome.storage.sync.get(['tariffRate', 'profitMargin'], (settings) => {
                const tariffRate = settings.tariffRate !== undefined ? parseFloat(settings.tariffRate) : 145; // Default 145%
                const profitMargin = settings.profitMargin !== undefined ? parseFloat(settings.profitMargin) : 25; // Default 25%

                console.log(`Amazon Tariff Estimator: Using Tariff Rate: ${tariffRate}%, Profit Margin: ${profitMargin}%`);

                if (!isNaN(tariffRate) && !isNaN(profitMargin)) {
                    const tariffAmount = calculateTariff(priceInfo.value, tariffRate, profitMargin);
                    console.log("Amazon Tariff Estimator: Calculated tariff amount:", tariffAmount);
                    displayTariffEstimate(tariffAmount, priceInfo);
                    
                    // Mark that the estimator has run successfully
                    estimatorHasRun = true;
                } else {
                    console.error("Amazon Tariff Estimator: Invalid settings found in storage.", settings);
                }
            });
        } else {
            console.log("Amazon Tariff Estimator: Could not find price information.");
        }
    } else {
        console.log("Amazon Tariff Estimator: Product not from China or country not found.");
         // Ensure any old estimate is removed if the country is not China or not found
         const priceInfo = getPrice();
         if (priceInfo) {
             const elements = priceInfo.insertionElements || [priceInfo.insertionElement];
             elements.forEach(element => {
                 if (element) {
                     const existingEstimate = element.querySelector('.tariff-estimate-text');
                     if (existingEstimate) {
                         existingEstimate.remove();
                         console.log("Amazon Tariff Estimator: Removed existing tariff estimate.");
                     }
                 }
             });
         }
         
         // Mark that the estimator has run (even if no tariff was displayed)
         estimatorHasRun = true;
    }
}

// --- Run on initial load ---
runEstimator();

// --- Observe for significant changes only (like variant selection) ---
// Use a more targeted MutationObserver approach
const observerCallback = (mutationsList, observer) => {
    // Check if the URL has changed (user navigated to a new product)
    if (window.location.href !== lastProductUrl) {
        console.log("Amazon Tariff Estimator: URL changed, resetting and re-running estimator.");
        estimatorHasRun = false;
        clearTimeout(observer.debounceTimer);
        observer.debounceTimer = setTimeout(() => runEstimator(true), 1000);
        return;
    }
    
    // Only proceed if we haven't successfully run the estimator yet
    // or if there are significant changes that warrant re-running
    if (!estimatorHasRun) {
        for(const mutation of mutationsList) {
            // Only check for significant DOM changes
            if (mutation.type === 'childList') {
                // Check for variant selection changes or product detail loading
                const significantChange =
                    // Check for variant selection changes
                    (mutation.target.id === 'variation_color_name' ||
                     mutation.target.id === 'variation_size_name' ||
                     // Check for product details being loaded
                     (mutation.addedNodes.length > 0 &&
                      Array.from(mutation.addedNodes).some(node =>
                        node.id === 'productDetails_detailBullets_sections1' ||
                        node.id === 'detailBullets_feature_div')));
                
                if (significantChange) {
                    console.log("Amazon Tariff Estimator: Detected significant change. Re-running estimator.");
                    clearTimeout(observer.debounceTimer);
                    // Use a longer timeout to ensure the DOM has fully updated
                    observer.debounceTimer = setTimeout(() => runEstimator(true), 1000);
                    break;
                }
            }
        }
    }
};

const observer = new MutationObserver(observerCallback);
observer.debounceTimer = null; // Add debounce timer property

// Only observe specific parts of the page that indicate significant changes
const setupObserver = () => {
    // Disconnect any existing observer
    observer.disconnect();
    
    // Target only the variant selection area and product details section
    const variantSelectors = [
        document.querySelector('#variation_color_name'),
        document.querySelector('#variation_size_name'),
        document.querySelector('#prodDetails'),
        document.querySelector('#detailBullets_feature_div')
    ].filter(Boolean); // Filter out null elements
    
    if (variantSelectors.length > 0) {
        // Use a more limited configuration
        const config = { childList: true, subtree: true };
        
        variantSelectors.forEach(node => {
            observer.observe(node, config);
        });
        
        console.log("Amazon Tariff Estimator: MutationObserver started on specific elements.");
    } else {
        // Fallback to a more general approach but with limited scope
        const targetNode = document.getElementById('dp-container');
        if (targetNode) {
            // More limited configuration
            const config = { childList: true, subtree: false };
            observer.observe(targetNode, config);
            console.log("Amazon Tariff Estimator: MutationObserver started on product container.");
        } else {
            console.error("Amazon Tariff Estimator: Could not find target nodes for MutationObserver.");
        }
    }
};

// Set up the observer after a short delay to ensure the page has loaded
setTimeout(setupObserver, 500);

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "settingsUpdated") {
    console.log("Amazon Tariff Estimator: Received settings update message. Re-running estimator.");
    // Force re-run when settings are updated
    runEstimator(true);
  }
});

// Listen for URL changes (for single-page applications)
let lastCheckedUrl = window.location.href;
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastCheckedUrl) {
    console.log("Amazon Tariff Estimator: URL changed, resetting state.");
    lastCheckedUrl = currentUrl;
    estimatorHasRun = false;
    setTimeout(() => runEstimator(true), 1000); // Give the page time to load
  }
}, 1000);