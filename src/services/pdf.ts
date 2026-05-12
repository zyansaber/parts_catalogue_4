import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PartApplication } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';

export class PDFService {
  static async generateApplicationPDF(application: PartApplication): Promise<void> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;

    // Generate English version only
    await this.generateEnglishPage(pdf, application, pageWidth, pageHeight, margin, contentWidth);

    // Save PDF
    const filename = `${application.ticket_id}_application.pdf`;
    pdf.save(filename);
  }

  private static async generateEnglishPage(
    pdf: jsPDF, 
    application: PartApplication, 
    pageWidth: number, 
    pageHeight: number, 
    margin: number, 
    contentWidth: number
  ): Promise<void> {
    let yPosition = margin;

    // Set font
    pdf.setFont('helvetica');

    // Header
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    const title = 'Part Application Form';
    pdf.text(title, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Ticket ID
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Ticket ID: ${application.ticket_id}`, margin, yPosition);
    yPosition += 10;

    // Date
    pdf.text(`Application Date: ${formatDate(application.created_at)}`, margin, yPosition);
    yPosition += 15;

    // Status and Urgency
    pdf.setFontSize(10);
    pdf.text(`Status: ${application.status.toUpperCase()}`, margin, yPosition);
    pdf.text(`Urgency: ${application.urgency.toUpperCase()}`, margin + 60, yPosition);
    yPosition += 15;

    // Main content
    pdf.setFontSize(12);
    
    // Part Information Section
    pdf.setFont('helvetica', 'bold');
    pdf.text('Part Information', margin, yPosition);
    yPosition += 8;
    
    pdf.setFont('helvetica', 'normal');
    
    const fields = [
      { label: 'Part Number:', value: application.part_number },
      { label: 'Supplier:', value: application.supplier_name },
      { label: 'Description:', value: application.part_description }
    ];

    fields.forEach(field => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(field.label, margin, yPosition);
      pdf.setFont('helvetica', 'normal');
      
      const lines = pdf.splitTextToSize(field.value, contentWidth - 40);
      pdf.text(lines, margin + 40, yPosition);
      yPosition += lines.length * 5 + 3;
    });

    yPosition += 5;

    // Request Information Section
    pdf.setFont('helvetica', 'bold');
    pdf.text('Request Information', margin, yPosition);
    yPosition += 8;
    
    pdf.setFont('helvetica', 'normal');
    
    const requestFields = [
      { label: 'Requested By:', value: application.requested_by },
      { label: 'Department:', value: application.department },
      { label: 'Estimated Cost:', value: formatCurrency(application.estimated_cost || 0) }
    ];

    requestFields.forEach(field => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(field.label, margin, yPosition);
      pdf.setFont('helvetica', 'normal');
      pdf.text(field.value, margin + 40, yPosition);
      yPosition += 7;
    });

    yPosition += 5;

    // Technical Specifications
    if (application.technical_specs) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Technical Specifications', margin, yPosition);
      yPosition += 8;
      
      pdf.setFont('helvetica', 'normal');
      const techLines = pdf.splitTextToSize(application.technical_specs, contentWidth);
      pdf.text(techLines, margin, yPosition);
      yPosition += techLines.length * 5 + 10;
    }

    // Business Justification
    if (application.justification) {
      if (yPosition > pageHeight - 60) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFont('helvetica', 'bold');
      pdf.text('Business Justification', margin, yPosition);
      yPosition += 8;
      
      pdf.setFont('helvetica', 'normal');
      const justificationLines = pdf.splitTextToSize(application.justification, contentWidth);
      pdf.text(justificationLines, margin, yPosition);
      yPosition += justificationLines.length * 5 + 10;
    }

    // Additional Notes
    if (application.application_notes) {
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFont('helvetica', 'bold');
      pdf.text('Additional Notes', margin, yPosition);
      yPosition += 8;
      
      pdf.setFont('helvetica', 'normal');
      const notesLines = pdf.splitTextToSize(application.application_notes, contentWidth);
      pdf.text(notesLines, margin, yPosition);
      yPosition += notesLines.length * 5 + 10;
    }

    // Add image if available - ENSURE IMAGE IS INCLUDED
    // Try multiple image sources: direct URL and Firebase storage URL with ticket ID
    const imageUrls = [];
    
    if (application.image_url) {
      imageUrls.push(application.image_url);
    }
    
    // Also try Firebase storage URL with ticket ID
    const firebaseImageUrl = `https://firebasestorage.googleapis.com/v0/b/parts-catalogue-mgx.appspot.com/o/part-applications%2F${application.ticket_id}.jpg?alt=media`;
    imageUrls.push(firebaseImageUrl);
    
    // Try alternative formats
    const firebaseImageUrlPng = `https://firebasestorage.googleapis.com/v0/b/parts-catalogue-mgx.appspot.com/o/part-applications%2F${application.ticket_id}.png?alt=media`;
    imageUrls.push(firebaseImageUrlPng);

    for (const imageUrl of imageUrls) {
      try {
        // Check if we need a new page for image
        if (yPosition > pageHeight - 100) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.text('Attached Image', margin, yPosition);
        yPosition += 10;

        // Create a temporary image element
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const imageLoaded = await new Promise((resolve) => {
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              // Calculate dimensions to fit within PDF
              const maxWidth = contentWidth;
              const maxHeight = 120; // Increased height for better visibility
              
              let { width, height } = img;
              const aspectRatio = width / height;
              
              if (width > maxWidth) {
                width = maxWidth;
                height = width / aspectRatio;
              }
              
              if (height > maxHeight) {
                height = maxHeight;
                width = height * aspectRatio;
              }
              
              canvas.width = width * 4; // Higher resolution
              canvas.height = height * 4;
              
              if (ctx) {
                // Set high-quality rendering
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                pdf.addImage(imgData, 'JPEG', margin, yPosition, width, height);
                
                yPosition += height + 10;
                console.log('Image successfully added to PDF from:', imageUrl);
              }
              
              resolve(true);
            } catch (error) {
              console.warn('Error processing image from', imageUrl, ':', error);
              resolve(false);
            }
          };
          
          img.onerror = () => {
            console.warn('Failed to load image from:', imageUrl);
            resolve(false);
          };
          
          img.src = imageUrl;
        });

        if (imageLoaded) {
          break; // Successfully loaded image, no need to try other URLs
        }
      } catch (error) {
        console.warn('Failed to add image from', imageUrl, ':', error);
        continue; // Try next URL
      }
    }

    // Footer
    const footerY = pageHeight - 15;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated: ${new Date().toLocaleDateString()} | Parts Application System`, pageWidth / 2, footerY, { align: 'center' });
  }
}