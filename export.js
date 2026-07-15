document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['pdf_export_data'], async (result) => {
    if (!result.pdf_export_data) {
      alert('No chat data found for export.');
      return;
    }

    const { html, title } = result.pdf_export_data;
    
    // Inject the HTML into our hidden pdf-container
    const container = document.getElementById('pdf-container');
    container.innerHTML = html;

    // Resolve html2pdf from global scope
    const html2pdf = window.html2pdf;
    if (!html2pdf) {
      console.error('html2pdf library not found.');
      alert('Failed to load PDF library.');
      return;
    }

    // Resolve the real jsPDF instance using a native Promise wrapper
    let pdf;
    try {
      const dummy = document.createElement('div');
      pdf = await new Promise((resolve, reject) => {
        html2pdf().set({
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(dummy).toPdf().get('pdf').then(resolve).catch(reject);
      });
    } catch (e) {
      console.error('Failed to initialize jsPDF instance:', e);
      alert('Failed to initialize PDF engine: ' + e.message);
      return;
    }

    // Configure PDF layout dimensions (A4 size: 210mm x 297mm)
    const pageWidthMm = 210;
    const pageHeightMm = 297;

    // We render elements at a target CSS width of 800px.
    // The scale factor to convert pixels (800px width) to mm (usableWidthMm = 190mm):
    // This maintains exact 100% correct aspect ratio without vertical stretching or compression.
    const leftMarginMm = 10;
    const rightMarginMm = 10;
    const usableWidthMm = pageWidthMm - leftMarginMm - rightMarginMm; // 190mm
    const pxToMm = usableWidthMm / 800; // 0.2375 mm per pixel

    // Margins (in mm)
    const topMarginMm = 15;
    const bottomMarginMm = 15;
    const usableHeightMm = pageHeightMm - topMarginMm - bottomMarginMm; // 267mm

    // Gather elements to render in order
    const headerEl = container.querySelector('.ag-header');
    const bodyEl = container.querySelector('#ag-chat-body');
    const items = [];
    if (headerEl) items.push(headerEl);
    if (bodyEl) {
      items.push(...Array.from(bodyEl.children));
    }

    if (items.length === 0) {
      alert('No conversation content found to render.');
      return;
    }

    let currentYMm = topMarginMm;
    let pageNum = 1;

    // Branding and page number footer helper
    function drawFooter(pNum, totalP) {
      pdf.setPage(pNum);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Powerbox for Gemini — https://github.com/BHasFallen/Ask-Gemini', leftMarginMm, pageHeightMm - 8);
      pdf.text(`Page ${pNum} of ${totalP}`, pageWidthMm - rightMarginMm - 18, pageHeightMm - 8);
    }

    // Process elements one by one
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Measure height of element in pixels
      const rect = item.getBoundingClientRect();
      const Hpx = rect.height;
      const HMm = Hpx * pxToMm;

      if (HMm <= 0) continue;

      const remHeightMm = (pageHeightMm - bottomMarginMm) - currentYMm;

      // Check if it fits completely in the remaining space of the current page
      if (HMm <= remHeightMm) {
        // Fits perfectly! Render in one piece
        try {
          const canvas = await new Promise((resolve, reject) => {
            html2pdf().set({
              html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
            }).from(item).toCanvas().get('canvas').then(resolve).catch(reject);
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          pdf.addImage(imgData, 'JPEG', leftMarginMm, currentYMm, usableWidthMm, HMm);
          currentYMm += HMm + 4; // update vertical cursor with gap
        } catch (err) {
          console.error('Error rendering element:', err);
        }
      } else {
        // Doesn't fit in the remaining space!
        // If the remaining space is small (less than 20mm, ~4 lines), and we are not already at the top,
        // it is better to just push the entire element to a new page to keep it clean.
        if (remHeightMm < 20 && currentYMm > topMarginMm) {
          pdf.addPage();
          pageNum++;
          currentYMm = topMarginMm;
          
          // Re-evaluate since we are on a fresh page
          i--;
          continue;
        }

        // Otherwise, render and slice it to fill the current page's remaining space
        try {
          const canvas = await new Promise((resolve, reject) => {
            html2pdf().set({
              html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
            }).from(item).toCanvas().get('canvas').then(resolve).catch(reject);
          });

          let sourceY = 0;
          const sourceHeightTotal = canvas.height;
          const sourceWidth = canvas.width;
          const pxPerMm = sourceHeightTotal / HMm;

          while (sourceY < sourceHeightTotal) {
            const currentRemHeightMm = (pageHeightMm - bottomMarginMm) - currentYMm;
            const sliceHeightPx = Math.min(currentRemHeightMm * pxPerMm, sourceHeightTotal - sourceY);
            const sliceHeightMm = sliceHeightPx / pxPerMm;

            if (sliceHeightPx <= 0) break;

            // Create temporary canvas for this slice
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = sourceWidth;
            sliceCanvas.height = sliceHeightPx;
            const sliceCtx = sliceCanvas.getContext('2d');
            
            sliceCtx.drawImage(
              canvas,
              0, sourceY, sourceWidth, sliceHeightPx,
              0, 0, sourceWidth, sliceHeightPx
            );

            const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', leftMarginMm, currentYMm, usableWidthMm, sliceHeightMm);

            currentYMm += sliceHeightMm;
            sourceY += sliceHeightPx;

            if (sourceY < sourceHeightTotal) {
              pdf.addPage();
              pageNum++;
              currentYMm = topMarginMm;
            }
          }
          currentYMm += 4; // gap
        } catch (err) {
          console.error('Error rendering sliced element:', err);
        }
      }
    }

    // Apply footers to all pages
    const totalPages = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      drawFooter(p, totalPages);
    }

    // Save and close
    try {
      pdf.save(`${title || 'Gemini_Chat'}.pdf`);
      chrome.runtime.sendMessage({ type: 'EXPORT_FINISHED' });
      chrome.storage.local.remove('pdf_export_data', () => {
        window.close();
      });
    } catch (saveErr) {
      console.error('Error saving PDF:', saveErr);
      chrome.runtime.sendMessage({ type: 'EXPORT_FINISHED' });
      alert('Failed to save PDF.');
    }
  });
});
