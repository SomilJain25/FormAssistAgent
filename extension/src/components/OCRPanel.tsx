import React, { useState, useRef } from 'react'
import { parseOCRForm, OCRField } from '../services/api'

interface OCRPanelProps {
  onFieldsExtracted: (fields: OCRField[]) => void
}

const OCRPanel: React.FC<OCRPanelProps> = ({ onFieldsExtracted }) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null)
  const [resultFields, setResultFields] = useState<OCRField[]>([])
  const [pagesProcessed, setPagesProcessed] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setResultFields([])

    // Show preview for images
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file))
    } else {
      setPreviewUrl(null)
    }

    setIsProcessing(true)
    try {
      const result = await parseOCRForm(file)
      setResultFields(result.fields)
      setPagesProcessed(result.pages_processed)
      onFieldsExtracted(result.fields)
    } catch (err) {
      setError('OCR processing failed. Is the backend running? Check file format (PNG/JPEG/PDF).')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClear = () => {
    setResultFields([])
    setPreviewUrl(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="ocr-panel">
      <p className="ocr-intro">
        📄 Upload a scanned form, screenshot, or PDF to detect fields with OCR.
      </p>

      {/* Upload zone */}
      <label className="ocr-upload-zone">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <span className="ocr-upload-icon">📤</span>
        <span className="ocr-upload-text">
          {isProcessing ? 'Processing...' : 'Click to upload image or PDF'}
        </span>
      </label>

      {error && <div className="error-box">⚠️ {error}</div>}

      {isProcessing && (
        <div className="ocr-processing">
          <div className="spinner" /> Running OCR... this may take a moment
        </div>
      )}

      {/* Preview */}
      {previewUrl && !isProcessing && (
        <img src={previewUrl} alt="Form preview" className="ocr-preview-img" />
      )}

      {/* Results */}
      {resultFields.length > 0 && (
        <>
          <div className="ocr-result-header">
            <span>✅ {resultFields.length} fields detected</span>
            {pagesProcessed > 1 && <span className="ocr-pages">{pagesProcessed} pages</span>}
            <button className="btn-icon" onClick={handleClear} title="Clear">✕</button>
          </div>

          <div className="ocr-field-list">
            {resultFields.map(field => (
              <div key={field.fieldId} className="ocr-field-item">
                <span className="field-type-badge" style={{ background: '#7b1fa2' }}>
                  {field.type}
                </span>
                <span className="ocr-field-label">{field.label}</span>
                <span className="ocr-field-conf">
                  {Math.round(field.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>

          <div className="hint-box">
            💡 These fields are now available for voice mapping — go to Speech tab.
          </div>
        </>
      )}
    </div>
  )
}

export default OCRPanel