import React, { useState } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { initializeApp } from 'firebase/app';

// The firebase config is provided by the canvas environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const apiKey = ""; // API key is automatically provided by the Canvas environment

/**
 * Convierte un objeto File a una cadena base64.
 * @param {File} file El archivo a convertir.
 * @returns {Promise<string>} Una promesa que se resuelve con la cadena base64.
 */
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
};

// Componente principal de la aplicación
const App = () => {
  const [image, setImage] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Maneja la selección del archivo e inicia el análisis de la imagen.
   * @param {React.ChangeEvent<HTMLInputElement>} e El evento de cambio del input de archivo.
   */
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      setPrompt('');
      const base64Data = await fileToBase64(file);
      await analyzeImage(base64Data);
    }
  };

  /**
   * Llama a la API de Gemini para analizar la imagen y generar un prompt.
   * @param {string} base64ImageData Los datos de la imagen codificados en base64.
   */
  const analyzeImage = async (base64ImageData) => {
    setLoading(true);
    setError('');

    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error("Authentication failed:", e);
      setError("Error de autenticación. Por favor, inténtelo de nuevo.");
      setLoading(false);
      return;
    }

    // Retroceso exponencial para llamadas a la API para manejar límites de tasa
    const backoff = (fn, retries = 5, delay = 1000) => {
      return new Promise((resolve, reject) => {
        fn()
          .then(resolve)
          .catch(async (err) => {
            if (retries > 0 && err.status === 429) {
              await new Promise(res => setTimeout(res, delay));
              console.log(`Reintentando llamada a la API... ${retries} reintentos restantes.`);
              backoff(fn, retries - 1, delay * 2).then(resolve).catch(reject);
            } else {
              reject(err);
            }
          });
      });
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Analyze this image. Generate a detailed, hyperrealistic image generation prompt in English. The prompt should meticulously describe the camera settings (e.g., camera model, lens, aperture, shutter speed, ISO), the lighting conditions (e.g., natural light, studio, time of day), the color grading and color palette, and the compositional elements (e.g., rule of thirds, leading lines, framing). The prompt should be ready to use for an AI image generator and be highly descriptive to achieve a photorealistic result.`
            },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64ImageData,
              }
            }
          ]
        }
      ],
    };

    try {
      const response = await backoff(() =>
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'No se pudo generar el prompt. Por favor, inténtelo de nuevo.';
      setPrompt(generatedText);

    } catch (e) {
      console.error('Error al analizar la imagen:', e);
      setError('Ocurrió un error al analizar la imagen. Inténtelo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Copia el prompt generado al portapapeles del usuario.
   */
  const copyPromptToClipboard = () => {
    // Un mensaje de alerta/modal personalizado debe usarse en lugar de window.alert() en una aplicación real
    const copyToClipboardFallback = (text) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('Prompt copiado al portapapeles!');
      } catch (err) {
        console.error('Fallback: Error al copiar:', err);
        alert('Error al copiar el prompt. Inténtelo de nuevo.');
      }
      document.body.removeChild(textarea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt)
        .then(() => {
          alert('Prompt copiado al portapapeles!');
        })
        .catch((err) => {
          console.error('Error al usar navigator.clipboard:', err);
          copyToClipboardFallback(prompt);
        });
    } else {
      copyToClipboardFallback(prompt);
    }
  };

  return (
    <div className="bg-gray-100 min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-4xl flex flex-col md:flex-row gap-8">
        {/* Lado izquierdo: Carga y visualización de la imagen */}
        <div className="flex-1 flex flex-col items-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Analizador de Imágenes</h1>
          <div className="w-full h-80 bg-gray-200 rounded-xl overflow-hidden flex items-center justify-center">
            {image ? (
              <img src={image} alt="Imagen subida" className="object-contain w-full h-full" />
            ) : (
              <span className="text-gray-500">Sube una imagen para analizar</span>
            )}
          </div>
          <label className="w-full cursor-pointer bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl text-center shadow-lg hover:bg-blue-700 transition-colors duration-200">
            Subir Imagen
            <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
          </label>
        </div>

        {/* Lado derecho: Visualización del prompt */}
        <div className="flex-1 flex flex-col space-y-4">
          <h2 className="text-2xl font-bold text-gray-800">Prompt Generado</h2>
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <span className="ml-4 text-gray-600">Analizando...</span>
            </div>
          )}
          {error && (
            <div className="text-red-500 text-center p-4 bg-red-100 rounded-xl">{error}</div>
          )}
          {!loading && prompt && (
            <div className="flex flex-col h-full">
              <textarea
                value={prompt}
                readOnly
                className="flex-1 p-4 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 resize-none font-mono text-sm"
              ></textarea>
              <button
                onClick={copyPromptToClipboard}
                className="mt-4 bg-green-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:bg-green-600 transition-colors duration-200"
              >
                Copiar Prompt
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

