import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Lock,
  Unlock,
  Download,
  Eye,
  EyeOff,
  Copy,
  Check,
  Shield,
  FileText,
  AlertCircle
} from 'lucide-react';

const encryptWithPassword = async (plainText, password) => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainText);
    const passwordKey = encoder.encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordKey,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    throw new Error('Encryption failed');
  }
};

const decryptWithPassword = async (cipherText, password) => {
  try {
    const encoder = new TextEncoder();
    const passwordKey = encoder.encode(password);
    
    const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordKey,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('Decryption failed - wrong password or corrupted data');
  }
};

export default function SteganographyApp() {
  const [mode, setMode] = useState('encode');
  const [imagePreview, setImagePreview] = useState(null);
  const [secretData, setSecretData] = useState('');
  const [dataInputMode, setDataInputMode] = useState('text');
  const [secretFileName, setSecretFileName] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [passwordMode, setPasswordMode] = useState('auto');
  const [customPassword, setCustomPassword] = useState('');
  const [encodedImage, setEncodedImage] = useState(null);
  const [decodedData, setDecodedData] = useState('');
  const [decodedFileName, setDecodedFileName] = useState('');
  const [decodedIsFile, setDecodedIsFile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [decodeId, setDecodeId] = useState('');
  const [decodePassword, setDecodePassword] = useState('');
  const [copied, setCopied] = useState({ id: false, password: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [capacityBits, setCapacityBits] = useState(0);
  const [capacityBytes, setCapacityBytes] = useState(0);
  const [estimatedEncryptedBytes, setEstimatedEncryptedBytes] = useState(0);
  const [capacityWarning, setCapacityWarning] = useState(false);

  const canvasRef = useRef(null);

  const generateId = () => {
    return 'IMG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 16; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    
    setError('');
    setEncodedImage(null);
    setDecodedData('');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImagePreview(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSecretFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum 5MB supported.');
      return;
    }
    
    setSecretFileName(file.name);
    setError('');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const base64Data = event.target.result;
        const fileData = `FILE:${file.name}:${file.type}:${base64Data}`;
        setSecretData(fileData);
      }
    };
    reader.readAsDataURL(file);
  };

  const stringToBinary = (str) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return Array.from(bytes).map((byte) => byte.toString(2).padStart(8, '0')).join('');
  };

  const binaryToString = (binary) => {
    if (!binary) return '';
    const bytes = binary.match(/.{1,8}/g);
    if (!bytes) return '';
    try {
      const arr = Uint8Array.from(bytes.map(b => parseInt(b, 2)));
      const decoder = new TextDecoder();
      return decoder.decode(arr);
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    if (!imagePreview) {
      setCapacityBits(0);
      setCapacityBytes(0);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      const totalPixels = Math.floor(pixels.length / 4);
      const usable = Math.max(0, totalPixels - 32);
      setCapacityBits(usable);
      setCapacityBytes(Math.floor(usable / 8));
    };
    img.src = imagePreview;
  }, [imagePreview]);

  useEffect(() => {
    if (!secretData) {
      setEstimatedEncryptedBytes(0);
      setCapacityWarning(false);
      return;
    }

    const estimateSize = async () => {
      try {
        const idForEstimate = generateId();
        const composed = `${idForEstimate}|${secretData}`;
        const placeholderPass = 'estimate-pass-12345';
        const encrypted = await encryptWithPassword(composed, placeholderPass);
        const encoder = new TextEncoder();
        const encBytes = encoder.encode(encrypted).length;
        setEstimatedEncryptedBytes(encBytes);
        const capBytes = Math.floor(capacityBits / 8);
        setCapacityWarning(encBytes > capBytes);
      } catch (e) {
        setEstimatedEncryptedBytes(0);
        setCapacityWarning(false);
      }
    };

    estimateSize();
  }, [secretData, capacityBits]);

  const encodeImage = async () => {
    if (!imagePreview || !secretData) {
      setError('Please upload an image and enter secret data');
      return;
    }

    if (passwordMode === 'custom' && customPassword.length < 8) {
      setError('Custom password must be at least 8 characters');
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      const id = generateId();
      const pass = passwordMode === 'auto' ? generatePassword() : customPassword;

      const encryptedPayload = await encryptWithPassword(secretData, pass);
      const composed = `${id}|${encryptedPayload}`;
      const binaryMessage = stringToBinary(composed);
      const messageBits = binaryMessage.length;

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imagePreview;
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      const totalPixels = Math.floor(pixels.length / 4);
      const usableBits = Math.max(0, totalPixels - 32);

      if (messageBits > usableBits) {
        throw new Error(`Image too small. Need ${Math.ceil(messageBits / 8)} bytes`);
      }

      const lengthBinary = messageBits.toString(2).padStart(32, '0');
      for (let i = 0; i < 32; i++) {
        const redIndex = i * 4;
        pixels[redIndex] = (pixels[redIndex] & 0xFE) | parseInt(lengthBinary[i], 10);
      }

      for (let i = 0; i < messageBits; i++) {
        const pixelIdx = (i + 32) * 4;
        pixels[pixelIdx] = (pixels[pixelIdx] & 0xFE) | parseInt(binaryMessage[i], 10);
      }

      ctx.putImageData(imageData, 0, 0);
      const encodedDataUrl = canvas.toDataURL('image/png');

      setEncodedImage(encodedDataUrl);
      setGeneratedId(id);
      setGeneratedPassword(pass);

    } catch (e) {
      setError(e.message || 'Encoding failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const decodeImage = async () => {
    if ((!imagePreview && !encodedImage) || !decodeId || !decodePassword) {
      setError('Please upload an image and enter both Image ID and Password');
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imagePreview || encodedImage;
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      const totalPixels = Math.floor(pixels.length / 4);
      if (totalPixels < 33) {
        throw new Error('Image too small or no encoded data present');
      }

      let lengthBinary = '';
      for (let i = 0; i < 32; i++) {
        const redIndex = i * 4;
        lengthBinary += (pixels[redIndex] & 1).toString();
      }
      const messageBits = parseInt(lengthBinary, 2);

      if (!messageBits || messageBits <= 0) {
        throw new Error('No encoded data found in this image');
      }

      let binaryMessage = '';
      for (let i = 0; i < messageBits; i++) {
        const redIndex = (i + 32) * 4;
        binaryMessage += (pixels[redIndex] & 1).toString();
      }

      const decodedMessage = binaryToString(binaryMessage);
      if (!decodedMessage || decodedMessage.indexOf('|') === -1) {
        throw new Error('No valid encoded data found');
      }

      const parts = decodedMessage.split('|');
      const extractedId = parts[0];
      const encryptedPayload = parts.slice(1).join('|');

      if (extractedId !== decodeId.trim()) {
        throw new Error('Provided Image ID does not match embedded ID');
      }

      const decrypted = await decryptWithPassword(encryptedPayload, decodePassword);

      if (decrypted.startsWith('FILE:')) {
        const fileMatch = decrypted.match(/^FILE:([^:]+):([^:]*):(.+)$/s);
        if (fileMatch) {
          setDecodedFileName(fileMatch[1]);
          setDecodedData(fileMatch[3]);
          setDecodedIsFile(true);
        } else {
          setDecodedData(decrypted);
          setDecodedIsFile(false);
        }
      } else {
        setDecodedData(decrypted);
        setDecodedIsFile(false);
      }

    } catch (e) {
      setError(e.message || 'Decoding failed');
      setDecodedData('');
      setDecodedIsFile(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!encodedImage) return;
    const link = document.createElement('a');
    link.download = `encoded-${generatedId}.png`;
    link.href = encodedImage;
    link.click();
  };

  const downloadDecodedFile = () => {
    if (!decodedData) return;
    const link = document.createElement('a');
    link.download = decodedFileName;
    link.href = decodedData;
    link.click();
  };

  const copyToClipboard = (text, field) => {
    const copyText = () => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        setCopied(prev => ({ ...prev, [field]: true }));
        setTimeout(() => setCopied(prev => ({ ...prev, [field]: false })), 2000);
      } catch (err) {
        setError('Failed to copy to clipboard');
      }
      
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(prev => ({ ...prev, [field]: true }));
        setTimeout(() => setCopied(prev => ({ ...prev, [field]: false })), 2000);
      }).catch(() => {
        copyText();
      });
    } else {
      copyText();
    }
  };

  const usedBytes = estimatedEncryptedBytes;
  const capBytes = Math.floor(capacityBits / 8);
  const percentUsed = capBytes === 0 ? 0 : Math.min(100, Math.round((usedBytes / capBytes) * 100));

  return (
    <div className="min-h-screen bg-black text-gray-100 p-6 font-sans">
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="text-center">
            <div className="animate-spin inline-block rounded-full h-20 w-20 border-4 border-cyan-400 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-300 font-mono">Processing...</p>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8 border-b border-cyan-500/30 pb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Shield className="text-cyan-400" size={36} />
            <h1 className="text-4xl font-bold text-cyan-400">STEGANOGRAPHY</h1>
          </div>
          <p className="text-gray-400 text-sm tracking-wider">COVERT DATA TRANSMISSION — AES-256-GCM ENCRYPTED</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-red-300 text-sm font-mono">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-300 text-xl font-bold">&times;</button>
          </div>
        )}

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => {
              setMode('encode');
              setSecretData('');
              setEncodedImage(null);
              setDecodedData('');
              setError('');
              setImagePreview(null);
              setSecretFileName('');
            }}
            className={`flex-1 py-3 px-6 rounded-lg font-mono font-semibold transition-all border-2 ${
              mode === 'encode'
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500 shadow-cyan-500/30 shadow-md'
                : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-600'
            }`}
          >
            <Lock className="inline mr-2" size={18} />
            ENCODE
          </button>
          <button
            onClick={() => {
              setMode('decode');
              setEncodedImage(null);
              setDecodedData('');
              setError('');
              setImagePreview(null);
              setSecretFileName('');
            }}
            className={`flex-1 py-3 px-6 rounded-lg font-mono font-semibold transition-all border-2 ${
              mode === 'decode'
                ? 'bg-green-500/20 text-green-400 border-green-500 shadow-green-500/30 shadow-md'
                : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-600'
            }`}
          >
            <Unlock className="inline mr-2" size={18} />
            DECODE
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6 shadow-xl">
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-mono text-cyan-400 mb-2 tracking-wider">
                &gt; UPLOAD IMAGE
              </label>
              <div className="border-2 border-dashed border-gray-700 rounded-lg bg-black/50 p-8 text-center hover:border-cyan-500/50 transition-all">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="imageUpload"
                />
                <label htmlFor="imageUpload" className="cursor-pointer">
                  <Upload className="mx-auto mb-2 text-gray-600" size={40} />
                  <p className="text-gray-500 text-sm font-mono">SELECT IMAGE FILE (.png, .jpeg, .webp)</p>
                </label>
              </div>
              {imagePreview && (
                <div className="mt-4 border border-cyan-500/30 rounded-lg p-2 bg-black/50">
                  <img src={imagePreview} alt="Preview" className="max-w-full h-auto rounded-md mx-auto" style={{ maxHeight: '250px' }} />
                </div>
              )}
              {encodedImage && (
                <div className="mt-4 border border-green-500/30 rounded-lg p-2 bg-black/50">
                  <p className="text-xs text-green-400 font-mono mb-2">ENCODED IMAGE</p>
                  <img src={encodedImage} alt="Encoded" className="max-w-full h-auto rounded-md mx-auto" style={{ maxHeight: '250px' }} />
                </div>
              )}

              {mode === 'encode' && imagePreview && (
                <div className="mt-4 p-3 bg-black/60 border border-gray-800 rounded-lg">
                  <p className="text-xs font-mono text-gray-400 mb-2">&gt; CAPACITY</p>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs text-gray-300 font-mono">
                      Capacity: <span className="font-bold text-cyan-300">{capacityBytes} bytes</span>
                    </div>
                    <div className="text-xs text-gray-300 font-mono">
                      Used: <span className={`font-bold ${capacityWarning ? 'text-red-400' : 'text-green-300'}`}>
                        {usedBytes} bytes
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-gray-800 h-3 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{
                        width: `${percentUsed}%`,
                        background: capacityWarning ? '#ef4444' : '#06b6d4'
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-gray-400 font-mono">
                    <div>Free: {Math.max(0, capBytes - usedBytes)} bytes</div>
                    <div>{percentUsed}%</div>
                  </div>

                  {capacityWarning && (
                    <div className="mt-3 text-xs text-red-300 font-mono">
                      ⚠ Payload exceeds capacity. Use larger image or reduce secret size.
                    </div>
                  )}
                </div>
              )}
            </div>

            {mode === 'encode' ? (
              <>
                <div>
                  <label className="block text-xs font-mono text-cyan-400 mb-2 tracking-wider">
                    &gt; SECRET DATA
                  </label>

                  <div className="flex gap-3 mb-3">
                    <button
                      onClick={() => {
                        setDataInputMode('text');
                        setSecretFileName('');
                        setSecretData('');
                      }}
                      className={`flex-1 py-2 px-4 rounded-lg font-mono text-sm transition-all border ${dataInputMode === 'text'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <FileText className="inline mr-2" size={16} />
                      TEXT
                    </button>
                    <button
                      onClick={() => {
                        setDataInputMode('file');
                        setSecretData('');
                        setSecretFileName('');
                      }}
                      className={`flex-1 py-2 px-4 rounded-lg font-mono text-sm transition-all border ${dataInputMode === 'file'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <Upload className="inline mr-2" size={16} />
                      FILE
                    </button>
                  </div>

                  {dataInputMode === 'text' ? (
                    <textarea
                      value={secretData}
                      onChange={(e) => setSecretData(e.target.value)}
                      placeholder="Enter secret message..."
                      className="w-full p-4 bg-black border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:border-cyan-500 focus:outline-none"
                      rows="4"
                    />
                  ) : (
                    <div>
                      <div className="border-2 border-dashed border-gray-700 rounded-lg bg-black/50 p-6 text-center hover:border-cyan-500/50 transition-all">
                        <input
                          type="file"
                          onChange={handleSecretFileUpload}
                          className="hidden"
                          id="secretFileUpload"
                        />
                        <label htmlFor="secretFileUpload" className="cursor-pointer">
                          <Upload className="mx-auto mb-2 text-gray-600" size={32} />
                          <p className="text-gray-500 text-sm font-mono">SELECT FILE (max 5MB)</p>
                        </label>
                      </div>
                      {secretFileName && (
                        <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                          <p className="text-sm text-cyan-400 font-mono">FILE: {secretFileName}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono text-cyan-400 mb-2 tracking-wider">
                    &gt; PASSWORD MODE
                  </label>
                  
                  <div className="flex gap-3 mb-3">
                    <button
                      onClick={() => {
                        setPasswordMode('auto');
                        setCustomPassword('');
                      }}
                      className={`flex-1 py-2 px-4 rounded-lg font-mono text-sm transition-all border ${passwordMode === 'auto'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <Shield className="inline mr-2" size={16} />
                      AUTO-GENERATE
                    </button>
                    <button
                      onClick={() => setPasswordMode('custom')}
                      className={`flex-1 py-2 px-4 rounded-lg font-mono text-sm transition-all border ${passwordMode === 'custom'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <Lock className="inline mr-2" size={16} />
                      CUSTOM
                    </button>
                  </div>

                  {passwordMode === 'custom' ? (
                    <div>
                      <input
                        type="text"
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="Enter custom password (min 8 characters)..."
                        className="w-full p-3 bg-black border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:border-cyan-500 focus:outline-none"
                      />
                      {customPassword && customPassword.length < 8 && (
                        <p className="text-xs text-red-400 font-mono mt-2">
                          ⚠ Password must be at least 8 characters
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                      <p className="text-xs text-cyan-400 font-mono">
                        ✓ A secure 16-character password will be auto-generated
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={encodeImage}
                  className="w-full bg-cyan-500 text-black py-3 px-6 rounded-lg font-mono font-bold hover:bg-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isProcessing || capacityWarning || !imagePreview || !secretData || (passwordMode === 'custom' && customPassword.length < 8)}
                >
                  &gt; INITIATE ENCODING
                </button>

                {encodedImage && generatedId && (
                  <div className="mt-6 p-6 bg-green-500/10 border border-green-500/50 rounded-lg">
                    <h3 className="text-lg font-mono font-bold text-green-400 mb-4">
                      [ ENCODING COMPLETE ]
                    </h3>

                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="block text-xs font-mono text-gray-400 mb-1">IMAGE ID</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={generatedId}
                            readOnly
                            className="flex-1 p-2 bg-black border border-green-500/50 rounded-md font-mono text-sm text-green-400"
                          />
                          <button
                            onClick={() => copyToClipboard(generatedId, 'id')}
                            className="px-3 py-2 bg-green-500/20 text-green-400 border border-green-500 rounded-md hover:bg-green-500/30"
                          >
                            {copied.id ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-gray-400 mb-1">
                          PASSWORD {passwordMode === 'auto' ? '(AUTO-GENERATED)' : '(CUSTOM)'}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={generatedPassword}
                            readOnly
                            className="flex-1 p-2 bg-black border border-green-500/50 rounded-md font-mono text-sm text-green-400"
                          />
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="px-3 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-600"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(generatedPassword, 'password')}
                            className="px-3 py-2 bg-green-500/20 text-green-400 border border-green-500 rounded-md hover:bg-green-500/30"
                          >
                            {copied.password ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={downloadImage}
                      className="w-full bg-green-500 text-black py-3 px-6 rounded-lg font-mono font-bold hover:bg-green-400 transition-all"
                    >
                      <Download className="inline mr-2" size={18} />
                      DOWNLOAD ENCODED IMAGE
                    </button>

                    <p className="text-xs text-gray-500 mt-3 font-mono text-center">
                      ⚠ SAVE CREDENTIALS — REQUIRED FOR DECODING
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-mono text-green-400 mb-2 tracking-wider">
                    &gt; IMAGE ID
                  </label>
                  <input
                    type="text"
                    value={decodeId}
                    onChange={(e) => setDecodeId(e.target.value)}
                    placeholder="Enter image ID..."
                    className="w-full p-3 bg-black border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-green-400 mb-2 tracking-wider">
                    &gt; PASSWORD
                  </label>
                  <input
                    type="password"
                    value={decodePassword}
                    onChange={(e) => setDecodePassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full p-3 bg-black border border-gray-700 rounded-lg text-gray-300 font-mono text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={decodeImage}
                  className="w-full bg-green-500 text-black py-3 px-6 rounded-lg font-mono font-bold hover:bg-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isProcessing || (!imagePreview && !encodedImage) || !decodeId || !decodePassword}
                >
                  &gt; INITIATE DECODING
                </button>

                {decodedData && (
                  <div className="mt-6 p-6 bg-cyan-500/10 border border-cyan-500/50 rounded-lg">
                    <h3 className="text-lg font-mono font-bold text-cyan-400 mb-3">
                      [ DECODING COMPLETE ]
                    </h3>
                    {decodedIsFile ? (
                      <div className="p-4 bg-black border border-cyan-500/30 rounded-lg">
                        <p className="text-gray-300 mb-3 font-mono text-sm">
                          FILE: {decodedFileName}
                        </p>
                        <button
                          onClick={downloadDecodedFile}
                          className="w-full bg-cyan-500 text-black py-2 px-4 rounded-lg font-mono font-bold hover:bg-cyan-400 transition-all"
                        >
                          <Download className="inline mr-2" size={18} />
                          DOWNLOAD FILE
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 bg-black border border-cyan-500/30 rounded-lg">
                        <p className="text-gray-300 whitespace-pre-wrap font-mono text-sm break-words">{decodedData}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="font-mono font-bold text-cyan-400 mb-3 text-sm tracking-wider">[ SYSTEM INFO ]</h3>
          <div className="space-y-2 text-xs text-gray-500 font-mono leading-relaxed">
            <p>&gt; LSB STEGANOGRAPHY + AES-256-GCM ENCRYPTION</p>
            <p>&gt; ENCODE: Secret encrypted with AES-GCM, then embedded in image LSBs</p>
            <p>&gt; DECODE: Requires correct IMAGE ID + PASSWORD</p>
            <p>&gt; SUPPORTS: Text messages and files (max 5MB)</p>
            <p>&gt; SECURITY: Uses Web Crypto API with PBKDF2 key derivation</p>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}