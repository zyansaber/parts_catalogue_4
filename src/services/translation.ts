export class TranslationService {
  static async translateText(text: string, targetLanguage: 'zh' | 'en'): Promise<string> {
    try {
      // Mock translation service - replace with actual API integration
      // For Chinese translation, simulate translation
      if (targetLanguage === 'zh') {
        const translations: Record<string, string> = {
          'Supplier': '供应商',
          'Description': '描述',
          'Part Number': '零件号',
          'Requested By': '申请人',
          'Department': '部门',
          'Technical Specifications': '技术规格',
          'Additional Notes': '备注',
          'Business Justification': '业务理由',
          'Engineering': '工程部',
          'Manufacturing': '制造部',
          'Quality': '质量部',
          'Purchasing': '采购部',
          'Low': '低',
          'Medium': '中',
          'High': '高',
          'pending': '待处理',
          'approved': '已批准',
          'rejected': '已拒绝'
        };

        // Simple word replacement for mock translation
        let translatedText = text;
        Object.entries(translations).forEach(([en, zh]) => {
          translatedText = translatedText.replace(new RegExp(en, 'gi'), zh);
        });

        return translatedText || text;
      }

      return text;
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    }
  }

  static async translateToEnglish(chineseText: string): Promise<string> {
    return this.translateText(chineseText, 'en');
  }

  static async translateToChinese(englishText: string): Promise<string> {
    return this.translateText(englishText, 'zh');
  }
}