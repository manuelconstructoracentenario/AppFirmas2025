// Sistema de almacenamiento local para Cente Docs
class LocalStorageService {
    constructor() {
        this.init();
    }

    init() {
        // Inicializar estructuras si no existen
        if (!this.getFromStorage('users')) {
            this.saveToStorage('users', {});
        }
        if (!this.getFromStorage('documents')) {
            this.saveToStorage('documents', []);
        }
        if (!this.getFromStorage('activities')) {
            this.saveToStorage('activities', []);
        }
    }

    // Usuarios
    async saveUser(user) {
        const users = this.getFromStorage('users') || {};
        users[user.email] = user;
        this.saveToStorage('users', users);
        return user;
    }

    async getUser(email) {
        const users = this.getFromStorage('users') || {};
        return users[email] || null;
    }

    async getAllUsers() {
        return this.getFromStorage('users') || {};
    }

    // Documentos
    async saveDocument(doc) {
        const documents = this.getFromStorage('documents') || [];
        const existingIndex = documents.findIndex(d => d.id === doc.id);
        
        if (existingIndex >= 0) {
            documents[existingIndex] = doc;
        } else {
            documents.push(doc);
        }
        
        // Ordenar por fecha (más reciente primero)
        documents.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        this.saveToStorage('documents', documents);
        return doc;
    }

    async getUserDocuments(userId) {
        const documents = this.getFromStorage('documents') || [];
        return documents.filter(doc => doc.uploadedBy === userId);
    }

    async getAllDocuments() {
        return this.getFromStorage('documents') || [];
    }

    async deleteDocument(documentId) {
        const documents = this.getFromStorage('documents') || [];
        const filtered = documents.filter(doc => doc.id !== documentId);
        this.saveToStorage('documents', filtered);
        return true;
    }

    // Actividades
    async saveActivity(activity) {
        const activities = this.getFromStorage('activities') || [];
        activities.unshift({
            ...activity,
            id: 'act_' + Date.now(),
            timestamp: new Date()
        });
        
        // Mantener solo las últimas 50 actividades
        if (activities.length > 50) {
            activities.splice(50);
        }
        
        this.saveToStorage('activities', activities);
        return activity;
    }

    async getRecentActivities(limit = 10) {
        const activities = this.getFromStorage('activities') || [];
        return activities.slice(0, limit);
    }

    // Helper methods
    getFromStorage(key) {
        try {
            const item = localStorage.getItem(`centedocs_${key}`);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Error reading from storage:', error);
            return null;
        }
    }

    saveToStorage(key, value) {
        try {
            localStorage.setItem(`centedocs_${key}`, JSON.stringify(value));
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }
}

// Estado de la aplicación
const AppState = {
    currentUser: null,
    currentSignature: null,
    documents: [],
    documentSignatures: [],
    currentDocument: null,
    currentZoom: 1.0
};

// Sistema de Autenticación Local
class AuthService {
    static async registerUser(email, password, name) {
        try {
            const storage = new LocalStorageService();
            const existingUser = await storage.getUser(email);
            
            if (existingUser) {
                return { 
                    success: false, 
                    error: 'Ya existe una cuenta con este correo electrónico' 
                };
            }

            const user = {
                uid: 'user_' + Date.now(),
                email: email,
                name: name,
                role: 'user',
                avatar: name.substring(0, 2).toUpperCase(),
                password: password,
                createdAt: new Date(),
                permissions: ['read', 'write', 'share']
            };

            await storage.saveUser(user);
            
            // Guardar actividad
            await storage.saveActivity({
                type: 'user_register',
                description: `Se registró en el sistema: ${name}`,
                userName: name
            });

            return { success: true, user: user };
        } catch (error) {
            console.error('Error en registro:', error);
            return { success: false, error: 'Error al crear la cuenta' };
        }
    }

    static async loginUser(email, password) {
        try {
            const storage = new LocalStorageService();
            const user = await storage.getUser(email);
            
            if (!user) {
                return { success: false, error: 'No existe una cuenta con este correo' };
            }

            if (user.password !== password) {
                return { success: false, error: 'La contraseña es incorrecta' };
            }

            // Guardar actividad
            await storage.saveActivity({
                type: 'user_login',
                description: `Inició sesión en el sistema`,
                userName: user.name
            });

            return { 
                success: true, 
                user: {
                    uid: user.uid,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    avatar: user.avatar,
                    permissions: user.permissions
                }
            };
        } catch (error) {
            console.error('Error en login:', error);
            return { success: false, error: 'Error en el inicio de sesión' };
        }
    }

    static logout() {
        AppState.currentUser = null;
        AppState.currentDocument = null;
        AppState.documentSignatures = [];
        localStorage.removeItem('centedocs_currentUser');
        showNotification('Sesión cerrada correctamente');
        
        // Mostrar login
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').classList.remove('active');
    }

    static getCurrentUser() {
        const user = localStorage.getItem('centedocs_currentUser');
        return user ? JSON.parse(user) : null;
    }

    static setCurrentUser(user) {
        localStorage.setItem('centedocs_currentUser', JSON.stringify(user));
        AppState.currentUser = user;
    }
}

// Sistema de Gestión de Archivos
class FileService {
    static files = [];
    
    static async uploadFiles(files) {
        const uploadedFiles = [];
        const storage = new LocalStorageService();
        
        for (const file of Array.from(files)) {
            try {
                const fileData = {
                    id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    url: URL.createObjectURL(file),
                    uploadDate: new Date(),
                    uploadedBy: AppState.currentUser.uid,
                    uploadedByName: AppState.currentUser.name,
                    signatures: [],
                    extension: file.name.split('.').pop().toLowerCase(),
                    source: 'uploaded'
                };
                
                await storage.saveDocument(fileData);
                uploadedFiles.push(fileData);
                
                // Agregar actividad
                await storage.saveActivity({
                    type: 'file_upload',
                    description: `Subió el archivo: ${file.name}`,
                    documentName: file.name,
                    userName: AppState.currentUser.name
                });
                
            } catch (error) {
                console.error('Error uploading file:', error);
                showNotification(`Error al subir ${file.name}`, 'error');
            }
        }
        
        return uploadedFiles;
    }
    
    static async loadUserDocuments() {
        try {
            const storage = new LocalStorageService();
            const documents = await storage.getUserDocuments(AppState.currentUser.uid);
            this.files = documents;
            return documents;
        } catch (error) {
            console.error('Error loading documents:', error);
            return [];
        }
    }

    static async loadAllDocuments() {
        try {
            const storage = new LocalStorageService();
            const documents = await storage.getAllDocuments();
            this.files = documents;
            return documents;
        } catch (error) {
            console.error('Error loading all documents:', error);
            return [];
        }
    }
    
    static getFileIcon(fileType, fileName = '') {
        const extension = fileName.split('.').pop().toLowerCase();
        
        if (fileType.startsWith('image/')) {
            return { icon: 'fas fa-file-image', color: '#2f6c46', type: 'image' };
        } else if (fileType === 'application/pdf') {
            return { icon: 'fas fa-file-pdf', color: '#e74c3c', type: 'pdf' };
        } else if (fileType.includes('word') || fileType.includes('document') || 
                   extension === 'doc' || extension === 'docx') {
            return { icon: 'fas fa-file-word', color: '#2b579a', type: 'word' };
        } else if (fileType.includes('excel') || fileType.includes('spreadsheet') || 
                   extension === 'xls' || extension === 'xlsx') {
            return { icon: 'fas fa-file-excel', color: '#217346', type: 'excel' };
        } else if (fileType.includes('powerpoint') || fileType.includes('presentation') || 
                   extension === 'ppt' || extension === 'pptx') {
            return { icon: 'fas fa-file-powerpoint', color: '#d24726', type: 'powerpoint' };
        } else if (extension === 'txt' || fileType.includes('text/plain')) {
            return { icon: 'fas fa-file-alt', color: '#6c8789', type: 'text' };
        } else if (extension === 'zip' || extension === 'rar' || fileType.includes('compressed')) {
            return { icon: 'fas fa-file-archive', color: '#f39c12', type: 'archive' };
        } else {
            return { icon: 'fas fa-file', color: '#6c8789', type: 'generic' };
        }
    }
    
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    static renderFilePreviews(files) {
        const previewsContainer = document.getElementById('filePreviews');
        if (!previewsContainer) return;
        
        previewsContainer.innerHTML = '';
        
        files.forEach(file => {
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item';
            
            const fileInfo = this.getFileIcon(file.type, file.name);
            let previewContent = '';
            
            if (fileInfo.type === 'image') {
                previewContent = `
                    <img src="${file.url}" alt="${file.name}" class="image-preview">
                `;
            } else if (fileInfo.type === 'pdf') {
                previewContent = `
                    <div class="document-preview pdf-preview">
                        <i class="fas fa-file-pdf" style="font-size: 48px; color: #e74c3c;"></i>
                        <div>PDF Document</div>
                        <div class="file-extension">.pdf</div>
                    </div>
                `;
            } else {
                previewContent = `
                    <div class="document-preview ${fileInfo.type}-preview">
                        <i class="${fileInfo.icon}" style="font-size: 48px; color: ${fileInfo.color};"></i>
                        <div>${this.getFileTypeDisplayName(fileInfo.type)}</div>
                        <div class="file-extension">.${file.extension}</div>
                    </div>
                `;
            }
            
            previewItem.innerHTML = `
                ${previewContent}
                <div class="file-preview-name">${file.name}</div>
                <div class="file-preview-size">${this.formatFileSize(file.size)}</div>
                <div class="file-preview-actions">
                    <button class="file-preview-btn" onclick="FileService.downloadFile('${file.id}')" title="Descargar">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="file-preview-btn" onclick="FileService.removeFile('${file.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            previewsContainer.appendChild(previewItem);
        });
    }
    
    static getFileTypeDisplayName(fileType) {
        const typeNames = {
            'word': 'Documento Word',
            'excel': 'Hoja de Cálculo',
            'powerpoint': 'Presentación',
            'pdf': 'PDF Document',
            'image': 'Imagen',
            'text': 'Documento de Texto',
            'archive': 'Archivo Comprimido',
            'generic': 'Documento'
        };
        return typeNames[fileType] || 'Documento';
    }
    
    static async renderFilesGrid() {
        const filesGrid = document.getElementById('filesGrid');
        const noFiles = document.getElementById('noFiles');
        const filesCount = document.getElementById('filesCount');
        
        if (!filesGrid || !noFiles || !filesCount) return;
        
        // Cargar documentos del usuario
        await this.loadUserDocuments();
        const userFiles = this.files;
        
        filesCount.textContent = `${userFiles.length} archivo${userFiles.length !== 1 ? 's' : ''}`;
        
        if (userFiles.length === 0) {
            noFiles.style.display = 'block';
            filesGrid.innerHTML = '';
            filesGrid.appendChild(noFiles);
            return;
        }
        
        noFiles.style.display = 'none';
        filesGrid.innerHTML = '';
        
        userFiles.forEach(file => {
            const fileInfo = this.getFileIcon(file.type, file.name);
            const fileCard = document.createElement('div');
            fileCard.className = 'file-card';
            
            const signedBadge = file.source === 'signed' ? '<div class="signed-badge"><i class="fas fa-signature"></i> Firmado</div>' : '';
            
            fileCard.innerHTML = `
                <div class="file-icon">
                    <i class="${fileInfo.icon}" style="color: ${fileInfo.color};"></i>
                </div>
                ${signedBadge}
                <div class="file-name">${file.name}</div>
                <div class="file-info">
                    <div>Subido: ${new Date(file.uploadDate).toLocaleDateString('es-ES')}</div>
                    <div>Tamaño: ${this.formatFileSize(file.size)}</div>
                    <div>Por: ${file.uploadedByName}</div>
                    <div>Tipo: ${this.getFileTypeDisplayName(fileInfo.type)}</div>
                    ${file.source === 'signed' ? '<div class="file-status-signed">✓ Documento firmado</div>' : ''}
                </div>
                <div class="file-actions">
                    <button class="file-action-btn" onclick="FileService.downloadFile('${file.id}')">
                        <i class="fas fa-download"></i> Descargar
                    </button>
                    <button class="file-action-btn" onclick="FileService.shareFile('${file.id}')">
                        <i class="fas fa-share"></i> Compartir
                    </button>
                </div>
            `;
            filesGrid.appendChild(fileCard);
        });
    }
    
    static async downloadFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            const a = document.createElement('a');
            a.href = file.url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification(`Descargando ${file.name}`);
        }
    }
    
    static shareFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            showNotification(`Enlace de compartir generado para ${file.name}`);
        }
    }
    
    static async removeFile(fileId) {
        if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
            return;
        }
        
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            try {
                const storage = new LocalStorageService();
                await storage.deleteDocument(fileId);
                
                // Actualizar lista local
                this.files = this.files.filter(f => f.id !== fileId);
                this.renderFilesGrid();
                DocumentService.renderDocumentSelector();
                
                // Agregar actividad
                await storage.saveActivity({
                    type: 'file_delete',
                    description: `Eliminó el archivo: ${file.name}`,
                    documentName: file.name,
                    userName: AppState.currentUser.name
                });
                
                showNotification(`Archivo ${file.name} eliminado`, 'warning');
            } catch (error) {
                console.error('Error deleting file:', error);
                showNotification('Error al eliminar el archivo', 'error');
            }
        }
    }
    
    static clearPreviews() {
        const previewsContainer = document.getElementById('filePreviews');
        const previewContainer = document.getElementById('filePreviewContainer');
        if (previewsContainer) previewsContainer.innerHTML = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }
    
    static async addSignedDocument(originalFileId, signedBlob, fileName, signatures) {
        try {
            const storage = new LocalStorageService();
            
            const signedFile = {
                id: 'signed_' + Date.now(),
                name: fileName,
                type: signedBlob.type,
                size: signedBlob.size,
                url: URL.createObjectURL(signedBlob),
                uploadDate: new Date(),
                uploadedBy: AppState.currentUser.uid,
                uploadedByName: AppState.currentUser.name,
                signatures: signatures,
                extension: fileName.split('.').pop().toLowerCase(),
                source: 'signed',
                originalFileId: originalFileId
            };

            await storage.saveDocument(signedFile);
            
            // Agregar actividad
            await storage.saveActivity({
                type: 'document_signed',
                description: `Firmó el documento: ${fileName}`,
                documentName: fileName,
                userName: AppState.currentUser.name
            });
            
            // Actualizar interfaces
            await this.loadUserDocuments();
            this.renderFilesGrid();
            DocumentService.renderDocumentSelector();
            
            return signedFile;
        } catch (error) {
            console.error('Error adding signed document:', error);
            throw error;
        }
    }
}

// Sistema de Generación de Firmas Automáticas
class SignatureGenerator {
    static generateAutomaticSignature(user) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const width = 600;
            const height = 130;
            canvas.width = width;
            canvas.height = height;
            
            ctx.clearRect(0, 0, width, height);
            
            const name = user.name;
            let nameLines = this.splitNameForLeftSide(name);
            
            const leftWidth = 250;
            
            ctx.font = 'bold 24px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#2f6c46';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            let nameY = (height - (nameLines.length * 28)) / 2;
            nameLines.forEach(line => {
                ctx.fillText(line, 15, nameY);
                nameY += 28;
            });
            
            ctx.strokeStyle = '#2f6c46';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(leftWidth + 5, 15);
            ctx.lineTo(leftWidth + 5, height - 15);
            ctx.stroke();
            
            ctx.font = '14px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#333333';
            ctx.textAlign = 'left';
            
            const now = new Date();
            const formattedDate = this.formatDate(now);
            
            const lines = [
                `Firmado digitalmente por:`,
                `${user.name}`,
                `Organización: Constructora Centenario`,
                `Email: ${user.email}`,
                `Fecha: ${formattedDate}`
            ];
            
            let y = 20;
            const rightStartX = leftWidth + 15;
            
            lines.forEach(line => {
                if (line.startsWith('Firmado digitalmente')) {
                    ctx.font = 'bold 14px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                } else if (line === user.name) {
                    ctx.font = 'bold 15px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                    ctx.fillStyle = '#2f6c46';
                } else {
                    ctx.font = '14px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                    ctx.fillStyle = '#333333';
                }
                
                ctx.fillText(line, rightStartX, y);
                y += 20;
            });
                        
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        });
    }

    static splitNameForLeftSide(fullName) {
        const words = fullName.trim().split(/\s+/);
        
        if (words.length === 4) {
            return [
                words[0] + ' ' + words[1],
                words[2] + ' ' + words[3]
            ];
        } else if (words.length === 3) {
            return [
                words[0] + ' ' + words[1],
                words[2]
            ];
        } else if (words.length === 2) {
            return [words[0], words[1]];
        } else {
            return [fullName];
        }
    }
    
    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        const timezoneOffset = -date.getTimezoneOffset();
        const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
        const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
        const offsetSign = timezoneOffset >= 0 ? '+' : '-';
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}:${offsetMinutes}`;
    }
    
    static async createUserSignature(user) {
        try {
            const signatureData = await this.generateAutomaticSignature(user);
            
            return {
                data: signatureData,
                type: 'auto',
                fileName: `firma_automatica_${user.name.replace(/\s+/g, '_')}.png`,
                userName: user.name,
                userEmail: user.email,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('Error al generar firma automática:', error);
            throw error;
        }
    }
}

// Sistema de Gestión de Documentos y Firmas
class DocumentService {
    static currentDocument = null;
    static currentZoom = 1.0;
    static isSignatureMode = false;
    static currentSignature = null;
    static documentSignatures = [];
    static isDraggingSignature = false;
    static currentDraggingSignature = null;
    static canvasClickHandler = null;

    static calculateOptimalDocumentSize(originalWidth, originalHeight, qualityMultiplier = 1) {
        const viewerContent = document.getElementById('viewerContent');
        if (!viewerContent) {
            return { width: originalWidth, height: originalHeight };
        }
        
        const containerWidth = viewerContent.clientWidth - 80;
        const containerHeight = viewerContent.clientHeight - 80;
        
        let width = originalWidth;
        let height = originalHeight;
        
        const scaleX = containerWidth / originalWidth;
        const scaleY = containerHeight / originalHeight;
        const scale = Math.min(scaleX, scaleY, 1.5) * qualityMultiplier;
        
        const minWidth = 600;
        const minHeight = 400;
        
        width = Math.max(originalWidth * scale, minWidth);
        height = Math.max(originalHeight * scale, minHeight);
        
        return { 
            width: Math.round(width), 
            height: Math.round(height),
            scale: scale
        };
    }

    static showLoadingMessage(canvas, ctx) {
        canvas.width = 600;
        canvas.height = 400;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Cargando documento...', canvas.width / 2, canvas.height / 2);
        
        ctx.fillStyle = '#6c8789';
        ctx.font = '16px Arial';
        ctx.fillText('Por favor espere', canvas.width / 2, canvas.height / 2 + 30);
    }

    static showErrorMessage(canvas, ctx, message) {
        canvas.width = 600;
        canvas.height = 400;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 10);
        
        ctx.fillStyle = '#6c8789';
        ctx.font = '14px Arial';
        ctx.fillText('Intente cargar el documento nuevamente', canvas.width / 2, canvas.height / 2 + 40);
    }

    static async loadDocument(file) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // LIMPIAR COMPLETAMENTE LAS FIRMAS ANTERIORES
                this.documentSignatures = [];
                this.currentSignature = null;
                this.currentZoom = 1.0;

                // Limpiar la capa de firmas en el DOM
                const signatureLayer = document.getElementById('signatureLayer');
                if (signatureLayer) {
                    signatureLayer.innerHTML = '';
                }

                // Actualizar la lista de firmas
                this.renderSignaturesList();

                this.currentDocument = {
                    id: file.id || 'doc_' + Date.now(),
                    name: file.name,
                    type: file.type,
                    url: file.url || URL.createObjectURL(file),
                    uploadDate: file.uploadDate || new Date(),
                    uploadedBy: file.uploadedBy || AppState.currentUser.uid,
                    uploadedByName: file.uploadedByName || AppState.currentUser.name,
                    signatures: [],
                    pages: file.pages || 1,
                    size: file.size,
                    extension: file.extension,
                    source: file.source || 'uploaded'
                };
                
                // Si el documento ya tiene firmas, cargarlas
                if (file.signatures && file.signatures.length > 0) {
                    this.documentSignatures = [...file.signatures];
                }
                
                setTimeout(async () => {
                    try {
                        await this.renderDocument();
                        this.renderDocumentSelector();
                        this.renderSignaturesList();
                        this.initializeDocumentInteractions();
                        
                        // APLICAR ZOOM INICIAL
                        this.applyRealZoom();
                        
                        syncFileSystem();
                        
                        resolve(this.currentDocument);
                    } catch (error) {
                        console.error('Error al cargar documento:', error);
                        showNotification('Error al cargar el documento', 'error');
                        resolve(null);
                    }
                }, 100);
                
            }, 500);
        });
    }

    static async renderDocument() {
        const noDocument = document.getElementById('noDocument');
        const documentContainer = document.getElementById('documentContainer');
        const canvas = document.getElementById('documentCanvas');
        const ctx = canvas.getContext('2d');

        if (!this.currentDocument) {
            if (noDocument) noDocument.style.display = 'block';
            if (documentContainer) documentContainer.style.display = 'none';
            return;
        }

        if (noDocument) noDocument.style.display = 'none';
        if (documentContainer) documentContainer.style.display = 'block';

        try {
            // Limpiar canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Mostrar mensaje de carga
            this.showLoadingMessage(canvas, ctx);

            // Renderizar el documento real basado en el tipo
            if (this.currentDocument.type === 'application/pdf') {
                await this.renderPDFDocument(canvas, ctx);
            } else if (this.currentDocument.type.startsWith('image/')) {
                await this.renderImageDocument(canvas, ctx);
            } else {
                await this.renderGenericDocument(canvas, ctx);
            }

            // Renderizar firmas existentes (si las hay)
            this.renderExistingSignatures();
            
            // Ajustar el contenedor al tamaño del canvas
            this.adjustContainerSize();
            
        } catch (error) {
            console.error('Error al renderizar documento:', error);
            this.showErrorMessage(canvas, ctx, 'Error al cargar el documento');
        }
    }

    static adjustContainerSize() {
        const canvas = document.getElementById('documentCanvas');
        const container = document.getElementById('documentContainer');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas && container) {
            // Resetear a tamaño natural
            const displayWidth = canvas.width;
            const displayHeight = canvas.height;
            
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            
            container.style.width = displayWidth + 'px';
            container.style.height = displayHeight + 'px';
            
            if (signatureLayer) {
                signatureLayer.style.width = displayWidth + 'px';
                signatureLayer.style.height = displayHeight + 'px';
                signatureLayer.style.transform = 'none';
            }
            
            // Resetear zoom a 100%
            this.currentZoom = 1.0;
            this.applyRealZoom();
            
            // Reposicionar firmas en tamaño natural
            this.documentSignatures.forEach(signature => {
                const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
                if (signatureElement) {
                    signatureElement.style.left = signature.x + 'px';
                    signatureElement.style.top = signature.y + 'px';
                    signatureElement.style.width = signature.width + 'px';
                    signatureElement.style.height = signature.height + 'px';
                    signatureElement.style.transform = 'none';
                }
            });
        }
    }

    static async renderPDFDocument(canvas, ctx) {
        try {
            const loadingTask = pdfjsLib.getDocument(this.currentDocument.url);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            
            const viewport = page.getViewport({ scale: 1 });
            const originalWidth = viewport.width;
            const originalHeight = viewport.height;
            
            // Usar un multiplicador de calidad para mejor resolución
            const optimalSize = this.calculateOptimalDocumentSize(originalWidth, originalHeight, 1.5);
            
            canvas.width = optimalSize.width;
            canvas.height = optimalSize.height;
            
            // Configurar el contexto para mejor calidad
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            const optimalViewport = page.getViewport({ scale: optimalSize.scale });
            
            const renderContext = {
                canvasContext: ctx,
                viewport: optimalViewport
            };
            
            await page.render(renderContext).promise;
            
        } catch (error) {
            console.error('Error al renderizar PDF:', error);
            this.renderPDFFallback(canvas, ctx);
        }
    }

    static renderPDFFallback(canvas, ctx) {
        const optimalSize = this.calculateOptimalDocumentSize(800, 1000);
        canvas.width = optimalSize.width;
        canvas.height = optimalSize.height;
        
        // Mejorar calidad del renderizado
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#e1e5e9';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('DOCUMENTO PDF - ' + this.currentDocument.name, 50, 60);
        
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.fillText('Este es el contenido real del documento PDF subido.', 50, 100);
        ctx.fillText('Documento subido por: ' + this.currentDocument.uploadedBy, 50, 130);
        ctx.fillText('Fecha de subida: ' + this.currentDocument.uploadDate.toLocaleDateString(), 50, 160);
        
        ctx.fillStyle = '#6c8789';
        ctx.font = '12px Arial';
        ctx.fillText('Página 1 de 1', canvas.width - 150, canvas.height - 30);
    }

    static async renderImageDocument(canvas, ctx) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const originalWidth = img.naturalWidth;
                const originalHeight = img.naturalHeight;
                
                // Usar calidad mejorada para imágenes
                const optimalSize = this.calculateOptimalDocumentSize(originalWidth, originalHeight, 1.2);
                
                canvas.width = optimalSize.width;
                canvas.height = optimalSize.height;
                
                // Configurar calidad de renderizado
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, optimalSize.width, optimalSize.height);
                resolve();
            };
            img.onerror = () => {
                this.renderImageFallback(canvas, ctx);
                resolve();
            };
            img.src = this.currentDocument.url;
        });
    }

    static renderImageFallback(canvas, ctx) {
        const optimalSize = this.calculateOptimalDocumentSize(600, 400);
        canvas.width = optimalSize.width;
        canvas.height = optimalSize.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('IMAGEN NO CARGADA', 50, 50);
        
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.fillText('Nombre: ' + this.currentDocument.name, 50, 100);
    }

    static async renderGenericDocument(canvas, ctx) {
        const optimalSize = this.calculateOptimalDocumentSize(800, 600);
        canvas.width = optimalSize.width;
        canvas.height = optimalSize.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const fileInfo = FileService.getFileIcon(this.currentDocument.type, this.currentDocument.name);
        
        const bgColors = {
            'word': '#e8f4f8',
            'excel': '#f0f8f0',
            'powerpoint': '#fdf0e8',
            'pdf': '#f8e8e8',
            'text': '#f8f8f8',
            'archive': '#fff8e8',
            'generic': '#f0f0f0'
        };
        
        ctx.fillStyle = bgColors[fileInfo.type] || '#f0f0f0';
        ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);
        
        ctx.fillStyle = fileInfo.color;
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        
        if (fileInfo.type === 'word') {
            ctx.fillText('W', canvas.width / 2, 150);
        } else if (fileInfo.type === 'excel') {
            ctx.fillText('X', canvas.width / 2, 150);
        } else if (fileInfo.type === 'powerpoint') {
            ctx.fillText('P', canvas.width / 2, 150);
        } else if (fileInfo.type === 'pdf') {
            ctx.fillText('PDF', canvas.width / 2, 150);
        } else {
            ctx.fillText('DOC', canvas.width / 2, 150);
        }
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DOCUMENTO - ' + this.currentDocument.name.toUpperCase(), canvas.width / 2, 200);
        
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        
        const infoLines = [
            `Nombre: ${this.currentDocument.name}`,
            `Tipo: ${FileService.getFileTypeDisplayName(fileInfo.type)}`,
            `Extensión: .${this.currentDocument.extension || 'doc'}`,
            `Tamaño: ${FileService.formatFileSize(this.currentDocument.size)}`,
            `Subido por: ${this.currentDocument.uploadedBy}`,
            `Fecha: ${this.currentDocument.uploadDate.toLocaleDateString('es-ES')}`
        ];
        
        let yPosition = 240;
        infoLines.forEach(line => {
            ctx.fillText(line, 60, yPosition);
            yPosition += 30;
        });
        
        ctx.fillStyle = '#6c8789';
        ctx.font = 'italic 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Este es un documento cargado en el sistema. Puedes agregar firmas digitales.', canvas.width / 2, canvas.height - 40);
        
        ctx.strokeStyle = '#e1e5e9';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    }

    // SISTEMA DE ZOOM
    static zoomIn() {
        this.currentZoom = Math.min(this.currentZoom + 0.25, 3.0);
        this.applyRealZoom();
    }

    static zoomOut() {
        this.currentZoom = Math.max(this.currentZoom - 0.25, 0.5);
        this.applyRealZoom();
    }

    static applyRealZoom() {
        const canvas = document.getElementById('documentCanvas');
        const container = document.getElementById('documentContainer');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas && container) {
            // Obtener el tamaño original del canvas (sin zoom)
            const originalWidth = canvas.width;
            const originalHeight = canvas.height;
            
            // Calcular nuevo tamaño basado en zoom
            const scaledWidth = originalWidth * this.currentZoom;
            const scaledHeight = originalHeight * this.currentZoom;
            
            // Aplicar zoom REAL: cambiar el tamaño del canvas y contenedor
            canvas.style.width = scaledWidth + 'px';
            canvas.style.height = scaledHeight + 'px';
            
            container.style.width = scaledWidth + 'px';
            container.style.height = scaledHeight + 'px';
            
            // Ajustar el layer de firmas al mismo tamaño
            if (signatureLayer) {
                signatureLayer.style.width = scaledWidth + 'px';
                signatureLayer.style.height = scaledHeight + 'px';
            }
            
            // Reposicionar firmas según el zoom
            this.repositionSignaturesForZoom();
        }
        
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    static repositionSignaturesForZoom() {
        const canvas = document.getElementById('documentCanvas');
        if (!canvas) return;
        
        // Obtener el tamaño original del canvas (sin zoom)
        const originalWidth = canvas.width / this.currentZoom;
        const originalHeight = canvas.height / this.currentZoom;
        
        this.documentSignatures.forEach(signature => {
            const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
            if (signatureElement) {
                // Calcular posición y tamaño escalados
                const scaledX = (signature.x / originalWidth) * canvas.width;
                const scaledY = (signature.y / originalHeight) * canvas.height;
                const scaledWidth = (signature.width / originalWidth) * canvas.width;
                const scaledHeight = (signature.height / originalHeight) * canvas.height;
                
                signatureElement.style.left = scaledX + 'px';
                signatureElement.style.top = scaledY + 'px';
                signatureElement.style.width = scaledWidth + 'px';
                signatureElement.style.height = scaledHeight + 'px';
            }
        });
    }

    static renderExistingSignatures() {
        const signatureLayer = document.getElementById('signatureLayer');
        if (!signatureLayer) return;
        
        signatureLayer.innerHTML = '';
        
        const canvas = document.getElementById('documentCanvas');
        if (canvas) {
            signatureLayer.style.width = canvas.style.width;
            signatureLayer.style.height = canvas.style.height;
        }
        
        this.documentSignatures.forEach(signature => {
            const signatureElement = this.createSignatureElement(signature);
            signatureLayer.appendChild(signatureElement);
        });
        
        // Aplicar zoom actual a las firmas recién renderizadas
        this.repositionSignaturesForZoom();
    }

    static createSignatureElement(signature) {
        const signatureElement = document.createElement('div');
        signatureElement.className = 'document-signature';
        signatureElement.style.left = signature.x + 'px';
        signatureElement.style.top = signature.y + 'px';
        signatureElement.style.width = signature.width + 'px';
        signatureElement.style.height = signature.height + 'px';
        signatureElement.dataset.signatureId = signature.id;
        
        signatureElement.innerHTML = `
            <img src="${signature.data}" alt="Firma de ${signature.userName}" onerror="this.style.display='none'" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; background: transparent !important;">
            <div class="signature-handle handle-top-left"></div>
            <div class="signature-handle handle-top-right"></div>
            <div class="signature-handle handle-bottom-left"></div>
            <div class="signature-handle handle-bottom-right"></div>
        `;
        
        this.makeSignatureInteractive(signatureElement, signature);
        return signatureElement;
    }

    static makeSignatureInteractive(element, signatureData) {
        element.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('signature-handle')) {
                this.startResize(e, element, signatureData);
            } else {
                this.startDrag(e, element, signatureData);
            }
        });

        element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectSignature(element);
        });
    }

    static startDrag(e, element, signatureData) {
        e.preventDefault();
        this.isDraggingSignature = true;
        this.currentDraggingSignature = { element, signatureData };

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = parseFloat(element.style.left);
        const startTop = parseFloat(element.style.top);

        function dragMove(e) {
            if (!DocumentService.isDraggingSignature) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            const newLeft = Math.max(0, startLeft + dx);
            const newTop = Math.max(0, startTop + dy);
            
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            signatureData.x = newLeft;
            signatureData.y = newTop;
        }

        function dragEnd() {
            DocumentService.isDraggingSignature = false;
            DocumentService.currentDraggingSignature = null;
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('mouseup', dragEnd);
        }

        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);
    }

    static startResize(e, element, signatureData) {
        e.preventDefault();
        e.stopPropagation();

        const handle = e.target;
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = parseFloat(element.style.width);
        const startHeight = parseFloat(element.style.height);
        const startLeft = parseFloat(element.style.left);
        const startTop = parseFloat(element.style.top);

        function resizeMove(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (handle.classList.contains('handle-top-left')) {
                newWidth = Math.max(50, startWidth - dx);
                newHeight = Math.max(30, startHeight - dy);
                newLeft = Math.max(0, startLeft + (startWidth - newWidth));
                newTop = Math.max(0, startTop + (startHeight - newHeight));
            } else if (handle.classList.contains('handle-top-right')) {
                newWidth = Math.max(50, startWidth + dx);
                newHeight = Math.max(30, startHeight - dy);
                newTop = Math.max(0, startTop + (startHeight - newHeight));
            } else if (handle.classList.contains('handle-bottom-left')) {
                newWidth = Math.max(50, startWidth - dx);
                newHeight = Math.max(30, startHeight + dy);
                newLeft = Math.max(0, startLeft + (startWidth - newWidth));
            } else if (handle.classList.contains('handle-bottom-right')) {
                newWidth = Math.max(50, startWidth + dx);
                newHeight = Math.max(30, startHeight + dy);
            }

            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';

            signatureData.width = newWidth;
            signatureData.height = newHeight;
            signatureData.x = newLeft;
            signatureData.y = newTop;
        }

        function resizeEnd() {
            document.removeEventListener('mousemove', resizeMove);
            document.removeEventListener('mouseup', resizeEnd);
        }

        document.addEventListener('mousemove', resizeMove);
        document.addEventListener('mouseup', resizeEnd);
    }

    static selectSignature(element) {
        document.querySelectorAll('.document-signature').forEach(sig => {
            sig.classList.remove('selected');
        });
        
        element.classList.add('selected');
    }

    static enableSignatureMode() {
        this.isSignatureMode = true;
        document.body.classList.add('signature-mode-active');
        
        const canvas = document.getElementById('documentCanvas');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas) canvas.style.cursor = 'crosshair';
        if (signatureLayer) signatureLayer.style.pointerEvents = 'none';
        
        this.canvasClickHandler = this.handleCanvasClick.bind(this);
        if (canvas) canvas.addEventListener('click', this.canvasClickHandler);
        
        showNotification('Modo firma activado - Haz clic en el documento para colocar tu firma');
    }

    static disableSignatureMode() {
        this.isSignatureMode = false;
        document.body.classList.remove('signature-mode-active');
        
        const canvas = document.getElementById('documentCanvas');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas) canvas.style.cursor = 'default';
        if (signatureLayer) signatureLayer.style.pointerEvents = 'auto';
        
        if (this.canvasClickHandler && canvas) {
            canvas.removeEventListener('click', this.canvasClickHandler);
            this.canvasClickHandler = null;
        }
    }

    static handleCanvasClick(e) {
        if (!this.isSignatureMode || !this.currentSignature) {
            return;
        }
        
        const canvas = document.getElementById('documentCanvas');
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        this.addSignatureToDocument(x, y);
        this.disableSignatureMode();
    }

    static async addSignatureToDocument(x, y) {
        if (!this.currentSignature) {
            showNotification('No hay firma seleccionada', 'error');
            return;
        }

        try {
            let width, height;
            const canvas = document.getElementById('documentCanvas');
            
            if (this.currentSignature.type === 'upload') {
                const img = new Image();
                img.src = this.currentSignature.data;
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                
                // Tamaño máximo para firmas cargadas
                const maxWidth = 280;
                const maxHeight = 140;
                
                width = img.naturalWidth;
                height = img.naturalHeight;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = width * ratio;
                    height = height * ratio;
                }
            } else {
                // Tamaño por defecto para firmas automáticas
                width = 250;
                height = 90;
            }

            // Guardar posiciones RELATIVAS al tamaño original del canvas
            const signature = {
                id: 'sig_' + Date.now(),
                data: this.currentSignature.data,
                userName: AppState.currentUser.name,
                userEmail: AppState.currentUser.email,
                x: x - (width / 2),
                y: y - (height / 2),
                width: width,
                height: height,
                timestamp: new Date(),
                type: this.currentSignature.type
            };
            
            signature.x = Math.max(0, signature.x);
            signature.y = Math.max(0, signature.y);
            
            if (canvas) {
                if (signature.x + signature.width > canvas.width) {
                    signature.x = canvas.width - signature.width;
                }
                if (signature.y + signature.height > canvas.height) {
                    signature.y = canvas.height - signature.height;
                }
            }
            
            this.documentSignatures.push(signature);
            if (this.currentDocument) {
                this.currentDocument.signatures = this.documentSignatures;
            }
            this.renderExistingSignatures();
            this.renderSignaturesList();
            
            showNotification('Firma agregada al documento');
            
        } catch (error) {
            console.error('Error al agregar firma:', error);
            showNotification('Error al agregar la firma', 'error');
        }
    }

    static setCurrentSignature(signatureData) {
        this.currentSignature = signatureData;
        this.enableSignatureMode();
    }

    static clearAllSignatures() {
        this.documentSignatures = [];
        if (this.currentDocument) {
            this.currentDocument.signatures = [];
        }
        this.renderExistingSignatures();
        this.renderSignaturesList();
        showNotification('Todas las firmas removidas', 'warning');
    }

    static renderSignaturesList() {
        const signaturesGrid = document.getElementById('signaturesGrid');
        const noSignatures = document.getElementById('noSignatures');
        
        if (!signaturesGrid || !noSignatures) return;
        
        if (this.documentSignatures.length === 0) {
            noSignatures.style.display = 'flex';
            signaturesGrid.innerHTML = '';
            signaturesGrid.appendChild(noSignatures);
            return;
        }
        
        noSignatures.style.display = 'none';
        signaturesGrid.innerHTML = '';
        
        this.documentSignatures.forEach(signature => {
            const signatureBadge = document.createElement('div');
            signatureBadge.className = 'signature-badge';
            signatureBadge.innerHTML = `
                <div class="signature-avatar">${signature.userName.substring(0, 2).toUpperCase()}</div>
                <div class="signature-user">${signature.userName}</div>
            `;
            signaturesGrid.appendChild(signatureBadge);
        });
    }

    static removeSignature(signatureId) {
        const index = this.documentSignatures.findIndex(sig => sig.id === signatureId);
        if (index > -1) {
            this.documentSignatures.splice(index, 1);
            if (this.currentDocument) {
                this.currentDocument.signatures = this.documentSignatures;
            }
            this.renderExistingSignatures();
            this.renderSignaturesList();
            showNotification('Firma removida', 'warning');
        }
    }

    static renderDocumentSelector() {
        const selector = document.getElementById('documentSelector');
        if (!selector || !FileService) return;

        selector.innerHTML = '<option value="">Seleccionar documento...</option>';
        
        // Mostrar solo documentos no firmados en el selector
        const unsignedFiles = FileService.files.filter(file => file.source === 'uploaded');
        
        const sortedFiles = [...unsignedFiles].sort((a, b) => 
            new Date(b.uploadDate) - new Date(a.uploadDate)
        );
        
        sortedFiles.forEach(file => {
            const fileInfo = FileService.getFileIcon(file.type, file.name);
            
            const compatibleTypes = ['pdf', 'image', 'word', 'excel', 'powerpoint', 'text', 'generic'];
            if (compatibleTypes.includes(fileInfo.type)) {
                const option = document.createElement('option');
                option.value = file.id;
                option.textContent = `${file.name} (${FileService.getFileTypeDisplayName(fileInfo.type)})`;
                if (this.currentDocument && this.currentDocument.id === file.id) {
                    option.selected = true;
                }
                selector.appendChild(option);
            }
        });
    }

    static initializeDocumentInteractions() {
        const container = document.getElementById('documentContainer');
        const canvas = document.getElementById('documentCanvas');
        
        if (container && canvas) {
            container.addEventListener('dragstart', (e) => {
                e.preventDefault();
            });
            
            container.style.touchAction = 'manipulation';
        }
    }

    static handleCanvasResize() {
        const canvas = document.getElementById('documentCanvas');
        const container = document.getElementById('documentContainer');
        
        if (canvas && container && this.currentDocument) {
            if (container.style.display !== 'none') {
                setTimeout(() => {
                    this.adjustContainerSize();
                }, 100);
            }
        }
    }
}

// Agregar un debounce para el redimensionamiento
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        DocumentService.handleCanvasResize();
    }, 250);
});

// Sistema de Exportación de Documentos con Firmas
class DocumentExportService {
    static async combineSignaturesWithDocument() {
        if (!DocumentService.currentDocument) {
            throw new Error('No hay documento seleccionado');
        }

        if (DocumentService.documentSignatures.length === 0) {
            throw new Error('No hay firmas para combinar');
        }

        showNotification('Combinando firmas con documento...');

        try {
            if (DocumentService.currentDocument.type === 'application/pdf') {
                return await this.combineWithPDF();
            } else if (DocumentService.currentDocument.type.startsWith('image/')) {
                return await this.combineWithImage();
            } else {
                return await this.combineWithGenericDocument();
            }
        } catch (error) {
            console.error('Error al combinar firmas:', error);
            throw new Error('Error al combinar las firmas con el documento: ' + error.message);
        }
    }

    static async combineWithPDF() {
        return new Promise(async (resolve, reject) => {
            try {
                // Renderizar PDF a alta resolución
                const loadingTask = pdfjsLib.getDocument(DocumentService.currentDocument.url);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                
                // Usar una escala más alta para mejor calidad
                const scale = 2.0;
                const viewport = page.getViewport({ scale });
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Configurar canvas con alta resolución
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                // Configurar calidad de renderizado
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;

                // Ahora agregar las firmas en alta resolución
                const displayCanvas = document.getElementById('documentCanvas');
                const signatureLayer = document.getElementById('signatureLayer');
                
                // Calcular factor de escala entre el canvas de visualización y el de alta resolución
                const scaleFactorX = canvas.width / displayCanvas.width;
                const scaleFactorY = canvas.height / displayCanvas.height;
                
                const signatures = signatureLayer.querySelectorAll('.document-signature');
                for (const signature of signatures) {
                    const img = signature.querySelector('img');
                    if (img && img.src) {
                        await this.waitForImageLoad(img);
                        const x = parseFloat(signature.style.left) * scaleFactorX;
                        const y = parseFloat(signature.style.top) * scaleFactorY;
                        const width = parseFloat(signature.style.width) * scaleFactorX;
                        const height = parseFloat(signature.style.height) * scaleFactorY;
                        
                        // Dibujar firma con suavizado
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, x, y, width, height);
                    }
                }

                // Crear PDF de alta calidad
                const { jsPDF } = window.jspdf;
                const pdfOutput = new jsPDF({
                    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [canvas.width, canvas.height]
                });

                // Usar máxima calidad para la imagen
                const imgData = canvas.toDataURL('image/png', 1.0);
                pdfOutput.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
                
                const pdfBlob = pdfOutput.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                
                resolve({
                    blob: pdfBlob,
                    url: pdfUrl,
                    type: 'application/pdf',
                    fileName: `documento_firmado_${Date.now()}.pdf`
                });

            } catch (error) {
                console.error('Error en combineWithPDF:', error);
                reject(error);
            }
        });
    }

    static async combineWithImage() {
        return new Promise(async (resolve, reject) => {
            try {
                // Cargar la imagen original
                const img = new Image();
                img.src = DocumentService.currentDocument.url;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                
                // Crear canvas con el tamaño original de la imagen
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                
                // Configurar calidad
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // Dibujar la imagen original
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Obtener y escalar las firmas
                const displayCanvas = document.getElementById('documentCanvas');
                const signatureLayer = document.getElementById('signatureLayer');
                
                const scaleFactorX = canvas.width / displayCanvas.width;
                const scaleFactorY = canvas.height / displayCanvas.height;
                
                const signatures = signatureLayer.querySelectorAll('.document-signature');
                for (const signature of signatures) {
                    const imgSignature = signature.querySelector('img');
                    if (imgSignature && imgSignature.src) {
                        await this.waitForImageLoad(imgSignature);
                        const x = parseFloat(signature.style.left) * scaleFactorX;
                        const y = parseFloat(signature.style.top) * scaleFactorY;
                        const width = parseFloat(signature.style.width) * scaleFactorX;
                        const height = parseFloat(signature.style.height) * scaleFactorY;
                        
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(imgSignature, x, y, width, height);
                    }
                }
                
                // Crear blob de alta calidad
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    resolve({
                        blob: blob,
                        url: url,
                        type: 'image/png',
                        fileName: `documento_firmado_${Date.now()}.png`
                    });
                }, 'image/png', 1.0);

            } catch (error) {
                console.error('Error en combineWithImage:', error);
                reject(error);
            }
        });
    }

    static async combineWithGenericDocument() {
        return new Promise((resolve, reject) => {
            try {
                const viewerContent = document.getElementById('viewerContent');
                
                // Usar html2canvas con configuración de alta calidad
                html2canvas(viewerContent, {
                    useCORS: true,
                    allowTaint: true,
                    scale: 3,
                    logging: false,
                    width: viewerContent.scrollWidth,
                    height: viewerContent.scrollHeight,
                    windowWidth: viewerContent.scrollWidth,
                    windowHeight: viewerContent.scrollHeight
                }).then(canvas => {
                    // Crear un canvas adicional para aplicar mejoras de calidad
                    const highQualityCanvas = document.createElement('canvas');
                    const ctx = highQualityCanvas.getContext('2d');
                    
                    // Mantener alta resolución
                    highQualityCanvas.width = canvas.width;
                    highQualityCanvas.height = canvas.height;
                    
                    // Configurar calidad
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // Dibujar el contenido original
                    ctx.drawImage(canvas, 0, 0);
                    
                    highQualityCanvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        resolve({
                            blob: blob,
                            url: url,
                            type: 'image/png',
                            fileName: `documento_firmado_${Date.now()}.png`
                        });
                    }, 'image/png', 1.0);
                    
                }).catch(error => {
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    static waitForImageLoad(img) {
        return new Promise((resolve, reject) => {
            if (img.complete && img.naturalWidth !== 0) {
                resolve();
            } else {
                img.addEventListener('load', () => resolve());
                img.addEventListener('error', () => reject(new Error('Error al cargar la imagen de la firma')));
            }
        });
    }

    static downloadCombinedDocument(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Asignar el método saveDocumentWithSignatures
DocumentService.saveDocumentWithSignatures = async function() {
    if (!this.currentDocument) {
        showNotification('No hay documento seleccionado', 'error');
        return;
    }
    
    if (this.documentSignatures.length === 0) {
        showNotification('No hay firmas en el documento para guardar', 'warning');
        return;
    }
    
    showNotification('Guardando documento firmado en alta calidad...');
    
    try {
        const result = await DocumentExportService.combineSignaturesWithDocument();
        
        // Descargar el documento combinado
        DocumentExportService.downloadCombinedDocument(result.blob, result.fileName);
        
        // Agregar el documento firmado al sistema de archivos
        await FileService.addSignedDocument(
            this.currentDocument.id,
            result.blob,
            result.fileName,
            this.documentSignatures
        );
        
        // Limpiar las firmas actuales para permitir nuevas firmas
        this.documentSignatures = [];
        this.renderExistingSignatures();
        this.renderSignaturesList();
        
        showNotification('Documento firmado guardado exitosamente en alta calidad.');

    } catch (error) {
        console.error('Error al guardar documento con firmas:', error);
        showNotification('Error al guardar el documento: ' + error.message, 'error');
    }
};

// Sistema de Previsualización Modal
class PreviewService {
    static async showPreview(blob, type, fileName) {
        const modal = document.getElementById('previewModal');
        const content = document.getElementById('previewContent');
        const downloadBtn = document.getElementById('downloadPreviewBtn');
        const closeBtn = document.getElementById('closePreviewBtn');
        const closeModalBtn = document.getElementById('closePreviewModal');
        
        if (!modal || !content) return;
        
        content.innerHTML = '';
        
        if (type === 'application/pdf') {
            content.innerHTML = `<embed class="preview-pdf" src="${URL.createObjectURL(blob)}" type="application/pdf" />`;
        } else {
            content.innerHTML = `<img class="preview-image" src="${URL.createObjectURL(blob)}" alt="Previsualización" style="max-width: 100%; height: auto;" />`;
        }
        
        downloadBtn.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        
        const closeModal = () => {
            modal.classList.remove('show');
            const embed = content.querySelector('embed');
            const img = content.querySelector('img');
            if (embed && embed.src) URL.revokeObjectURL(embed.src);
            if (img && img.src) URL.revokeObjectURL(img.src);
        };
        
        closeBtn.onclick = closeModal;
        closeModalBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        
        modal.classList.add('show');
    }
}

// Función para previsualizar el documento combinado
DocumentService.previewCombinedDocument = async function() {
    if (!this.currentDocument) {
        showNotification('No hay documento seleccionado', 'error');
        return;
    }
    
    if (this.documentSignatures.length === 0) {
        showNotification('No hay firmas en el documento para previsualizar', 'warning');
        return;
    }
    
    showNotification('Generando previsualización en alta calidad...');
    
    try {
        const result = await DocumentExportService.combineSignaturesWithDocument();
        await PreviewService.showPreview(result.blob, result.type, result.fileName);
        
    } catch (error) {
        console.error('Error al previsualizar documento:', error);
        showNotification('Error al generar previsualización: ' + error.message, 'error');
    }
};

// Sistema de Actividades
class ActivityService {
    static async loadRecentActivities() {
        try {
            const storage = new LocalStorageService();
            const activities = await storage.getRecentActivities(10);
            this.renderActivities(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }
    
    static renderActivities(activities) {
        const activityFeed = document.querySelector('.activity-feed');
        if (!activityFeed) return;
        
        // Limpiar actividades existentes (excepto el título)
        const activityItems = activityFeed.querySelectorAll('.activity-item');
        activityItems.forEach(item => item.remove());
        
        activities.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            
            const icon = this.getActivityIcon(activity.type);
            const time = new Date(activity.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            activityItem.innerHTML = `
                <div class="activity-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="activity-content">
                    <div>${activity.description}</div>
                    <div class="activity-time">${time}</div>
                </div>
            `;
            
            activityFeed.appendChild(activityItem);
        });
    }
    
    static getActivityIcon(activityType) {
        const icons = {
            'file_upload': 'fas fa-upload',
            'file_delete': 'fas fa-trash',
            'document_signed': 'fas fa-signature',
            'user_login': 'fas fa-sign-in-alt',
            'user_register': 'fas fa-user-plus'
        };
        return icons[activityType] || 'fas fa-info-circle';
    }
}

// Sistema de Colaboración
class CollaborationService {
    static async updateOnlineUsers() {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;
        
        usersList.innerHTML = '';
        
        if (AppState.currentUser) {
            const userItem = document.createElement('li');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-status"></div>
                <div>${AppState.currentUser.name} 
                    <span class="permission-badge permission-owner">
                        Propietario
                    </span>
                </div>
            `;
            usersList.appendChild(userItem);
        }
        
        if (usersList.children.length === 0) {
            const emptyMessage = document.createElement('li');
            emptyMessage.className = 'user-item';
            emptyMessage.innerHTML = `
                <div style="color: rgba(255,255,255,0.7); font-size: 14px;">
                    Solo tú estás conectado
                </div>
            `;
            usersList.appendChild(emptyMessage);
        }
    }

    static async renderCollaborators() {
        const collaboratorsList = document.getElementById('collaboratorsList');
        const collaboratorsCount = document.getElementById('collaboratorsCount');
        
        if (!collaboratorsList || !collaboratorsCount) return;
        
        collaboratorsCount.textContent = `1 miembro`;
        collaboratorsList.innerHTML = '';
        
        const collaboratorItem = document.createElement('div');
        collaboratorItem.className = 'collaborator-item';
        collaboratorItem.innerHTML = `
            <div class="collaborator-avatar">${AppState.currentUser.avatar}</div>
            <div class="collaborator-details">
                <div class="collaborator-name">${AppState.currentUser.name}</div>
                <div class="collaborator-email">${AppState.currentUser.email}</div>
                <div class="user-role-badge permission-owner">
                    Propietario
                </div>
            </div>
        `;
        collaboratorsList.appendChild(collaboratorItem);
    }
}

// Utilidades
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type, 'show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function updateTimestamp() {
    const now = new Date();
    const updateTime = document.getElementById('updateTime');
    if (updateTime) {
        updateTime.textContent = `Hoy, ${now.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}`;
    }
}

function applyUserPermissions() {
    // Implementar según roles si es necesario
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const pageElement = document.getElementById(`${pageId}-page`);
    if (pageElement) pageElement.classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(navLink => {
        navLink.classList.remove('active');
        if (navLink.dataset.page === pageId) {
            navLink.classList.add('active');
        }
    });
    
    // Cargar datos específicos de la página
    if (pageId === 'files') {
        FileService.renderFilesGrid();
    } else if (pageId === 'collaborators') {
        CollaborationService.renderCollaborators();
    } else if (pageId === 'documents') {
        ActivityService.loadRecentActivities();
    }
}

function syncFileSystem() {
    DocumentService.renderDocumentSelector();
    
    if (document.getElementById('files-page') && 
        document.getElementById('files-page').classList.contains('active')) {
        FileService.renderFilesGrid();
    }
}

function updateAutoSignaturePreview() {
    const autoPreview = document.getElementById('autoSignaturePreview');
    if (!autoPreview || !AppState.currentSignature || AppState.currentSignature.type !== 'auto') return;
    
    autoPreview.innerHTML = `
        <img src="${AppState.currentSignature.data}" alt="Firma automática" 
             style="max-width: 100%; max-height: 80px; background: transparent; border: 1px solid #e1e5e9; border-radius: 4px;">
    `;
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', function() {
    // Verificar si hay un usuario logueado
    const savedUser = AuthService.getCurrentUser();
    if (savedUser) {
        AppState.currentUser = savedUser;
        
        // Generar firma automática
        SignatureGenerator.createUserSignature(AppState.currentUser)
            .then(signature => {
                AppState.currentSignature = signature;
                updateAutoSignaturePreview();
            })
            .catch(error => {
                console.error('Error generating signature:', error);
            });
        
        // Actualizar UI
        const currentUserName = document.getElementById('currentUserName');
        const userAvatar = document.getElementById('userAvatar');
        const userRoleBadge = document.getElementById('userRoleBadge');
        
        if (currentUserName) currentUserName.textContent = AppState.currentUser.name;
        if (userAvatar) userAvatar.textContent = AppState.currentUser.avatar;
        if (userRoleBadge) {
            userRoleBadge.textContent = 'Propietario';
        }
        
        // Mostrar aplicación
        const loginScreen = document.getElementById('loginScreen');
        const appContainer = document.getElementById('appContainer');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.classList.add('active');
        
        // Inicializar servicios
        CollaborationService.updateOnlineUsers();
        CollaborationService.renderCollaborators();
        FileService.renderFilesGrid();
        DocumentService.renderDocumentSelector();
        ActivityService.loadRecentActivities();
        
    } else {
        // Mostrar pantalla de login
        const loginScreen = document.getElementById('loginScreen');
        const appContainer = document.getElementById('appContainer');
        
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.classList.remove('active');
    }
    
    // Configuración del sistema de autenticación - LOGIN
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email');
            const password = document.getElementById('password');
            
            if (!email || !password || !email.value || !password.value) {
                showNotification('Por favor, completa todos los campos', 'error');
                return;
            }
            
            try {
                const result = await AuthService.loginUser(email.value, password.value);
                
                if (result.success) {
                    AuthService.setCurrentUser(result.user);
                    AppState.currentUser = result.user;
                    
                    // Generar firma automática
                    try {
                        const autoSignature = await SignatureGenerator.createUserSignature(result.user);
                        AppState.currentSignature = autoSignature;
                        updateAutoSignaturePreview();
                    } catch (error) {
                        console.error('Error generating signature:', error);
                    }
                    
                    // Actualizar UI
                    const currentUserName = document.getElementById('currentUserName');
                    const userAvatar = document.getElementById('userAvatar');
                    const userRoleBadge = document.getElementById('userRoleBadge');
                    
                    if (currentUserName) currentUserName.textContent = result.user.name;
                    if (userAvatar) userAvatar.textContent = result.user.avatar;
                    if (userRoleBadge) {
                        userRoleBadge.textContent = 'Propietario';
                    }
                    
                    // Mostrar aplicación
                    const loginScreen = document.getElementById('loginScreen');
                    const appContainer = document.getElementById('appContainer');
                    
                    if (loginScreen) loginScreen.style.display = 'none';
                    if (appContainer) appContainer.classList.add('active');
                    
                    // Inicializar servicios
                    CollaborationService.updateOnlineUsers();
                    CollaborationService.renderCollaborators();
                    FileService.renderFilesGrid();
                    DocumentService.renderDocumentSelector();
                    ActivityService.loadRecentActivities();
                    
                    showNotification(`¡Bienvenido a Cente Docs, ${result.user.name}!`);
                } else {
                    showNotification(result.error, 'error');
                }
            } catch (error) {
                showNotification('Error en el inicio de sesión', 'error');
            }
        });
    }
    
    // Sistema de REGISTRO
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async function() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                showNotification('Por favor, completa todos los campos', 'error');
                return;
            }
            
            const name = prompt('Por favor, ingresa tu nombre completo:');
            if (!name) {
                showNotification('El nombre es requerido', 'error');
                return;
            }
            
            try {
                const result = await AuthService.registerUser(email, password, name);
                
                if (result.success) {
                    showNotification(`¡Cuenta creada exitosamente! Bienvenido ${name}`);
                    // Limpiar formulario
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                } else {
                    showNotification(result.error, 'error');
                }
            } catch (error) {
                showNotification('Error en el registro', 'error');
            }
        });
    }
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            AuthService.logout();
        });
    }
    
    // Manejo de pestañas de firma
    document.querySelectorAll('.signature-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            // Remover active de todas las pestañas y contenidos
            document.querySelectorAll('.signature-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.signature-tab-content').forEach(c => c.classList.remove('active'));
            
            // Activar pestaña y contenido actual
            this.classList.add('active');
            const content = document.getElementById(`${tabId}-tab`);
            if (content) content.classList.add('active');
        });
    });
    
    // Botón para usar firma automática
    const useAutoSignatureBtn = document.getElementById('useAutoSignature');
    if (useAutoSignatureBtn) {
        useAutoSignatureBtn.addEventListener('click', function() {
            if (AppState.currentSignature && AppState.currentSignature.type === 'auto') {
                DocumentService.setCurrentSignature(AppState.currentSignature);
                showNotification('Firma automática seleccionada');
            } else {
                showNotification('No hay firma automática disponible', 'error');
            }
        });
    }
    
    // Botón para actualizar firma automática
    const refreshAutoSignatureBtn = document.getElementById('refreshAutoSignature');
    if (refreshAutoSignatureBtn) {
        refreshAutoSignatureBtn.addEventListener('click', async function() {
            if (!AppState.currentUser) {
                showNotification('No hay usuario logueado', 'error');
                return;
            }
            
            try {
                const autoSignature = await SignatureGenerator.createUserSignature(AppState.currentUser);
                AppState.currentSignature = autoSignature;
                
                // Actualizar vista previa
                const signaturePreview = document.getElementById('signaturePreview');
                if (signaturePreview) {
                    signaturePreview.src = autoSignature.data;
                }
                
                // Actualizar previsualización automática
                updateAutoSignaturePreview();
                
                showNotification('Firma automática actualizada');
            } catch (error) {
                console.error('Error al actualizar firma automática:', error);
                showNotification('Error al actualizar firma automática', 'error');
            }
        });
    }
    
    // Sistema de firmas - Cargar firma
    const signatureFileInput = document.getElementById('signatureFileInput');
    const uploadSignatureArea = document.getElementById('uploadSignatureArea');
    const saveUploadSignatureBtn = document.getElementById('saveUploadSignature');
    const clearUploadSignatureBtn = document.getElementById('clearUploadSignature');
    
    if (uploadSignatureArea) {
        uploadSignatureArea.addEventListener('click', function() {
            if (signatureFileInput) signatureFileInput.click();
        });
    }
    
    if (signatureFileInput) {
        signatureFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const file = this.files[0];
                const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
                
                if (!validTypes.includes(file.type)) {
                    showNotification('Por favor, selecciona un archivo válido (PNG, JPG, SVG)', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const signatureData = e.target.result;
                    
                    const signaturePreview = document.getElementById('signaturePreview');
                    const noSignature = document.getElementById('noSignature');
                    const signatureInfo = document.getElementById('signatureInfo');
                    
                    if (signaturePreview) {
                        signaturePreview.src = signatureData;
                        signaturePreview.style.display = 'block';
                    }
                    if (noSignature) noSignature.style.display = 'none';
                    if (signatureInfo) {
                        signatureInfo.textContent = `Archivo: ${file.name}`;
                        signatureInfo.style.display = 'block';
                    }
                    
                    AppState.currentSignature = {
                        data: signatureData,
                        type: 'upload',
                        fileName: file.name
                    };
                };
                
                reader.readAsDataURL(file);
            }
        });
    }
    
    if (saveUploadSignatureBtn) {
        saveUploadSignatureBtn.addEventListener('click', function() {
            if (!AppState.currentSignature) {
                showNotification('Por favor, carga una firma digital primero', 'error');
                return;
            }
            
            DocumentService.setCurrentSignature(AppState.currentSignature);
            showNotification('Firma guardada correctamente');
        });
    }
    
    if (clearUploadSignatureBtn) {
        clearUploadSignatureBtn.addEventListener('click', function() {
            const signaturePreview = document.getElementById('signaturePreview');
            const noSignature = document.getElementById('noSignature');
            const signatureInfo = document.getElementById('signatureInfo');
            
            if (signaturePreview) signaturePreview.style.display = 'none';
            if (noSignature) noSignature.style.display = 'block';
            if (signatureInfo) signatureInfo.style.display = 'none';
            if (signatureFileInput) signatureFileInput.value = '';
            
            AppState.currentSignature = null;
            showNotification('Firma eliminada', 'warning');
        });
    }
    
    // Selector de documentos
    const documentSelector = document.getElementById('documentSelector');
    if (documentSelector) {
        documentSelector.addEventListener('change', function() {
            if (this.value) {
                const file = FileService.files.find(f => f.id === this.value);
                if (file) {
                    DocumentService.loadDocument(file);
                } else {
                    const noDocument = document.getElementById('noDocument');
                    const documentContainer = document.getElementById('documentContainer');
                    
                    if (noDocument) noDocument.style.display = 'block';
                    if (documentContainer) documentContainer.style.display = 'none';
                }
            } else {
                const noDocument = document.getElementById('noDocument');
                const documentContainer = document.getElementById('documentContainer');
                
                if (noDocument) noDocument.style.display = 'block';
                if (documentContainer) documentContainer.style.display = 'none';
            }
        });
    }
    
    // Botón para subir documento DESDE LA PÁGINA DE DOCUMENTOS
    const uploadDocumentBtn = document.getElementById('uploadDocumentBtn');
    const documentFileInput = document.createElement('input');
    documentFileInput.type = 'file';
    documentFileInput.style.display = 'none';
    documentFileInput.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar';
    document.body.appendChild(documentFileInput);
    
    if (uploadDocumentBtn) {
        uploadDocumentBtn.addEventListener('click', function() {
            documentFileInput.click();
        });
    }
    
    documentFileInput.addEventListener('change', async function() {
        if (this.files.length > 0) {
            try {
                showNotification(`Subiendo documento...`);
                
                // Subir archivos a FileService
                const uploadedFiles = await FileService.uploadFiles(this.files);
                
                // Cargar el primer documento subido
                if (uploadedFiles.length > 0) {
                    await DocumentService.loadDocument(uploadedFiles[0]);
                    showNotification(`Documento subido correctamente`);
                }
                
                // Actualizar la página de archivos si está activa
                if (document.getElementById('files-page') && 
                    document.getElementById('files-page').classList.contains('active')) {
                    FileService.renderFilesGrid();
                }
                
                // Limpiar input para permitir subir más archivos
                this.value = '';
                
            } catch (error) {
                console.error('Error al subir documento:', error);
                showNotification('Error al subir documento', 'error');
            }
        }
    });
    
    // Botón para agregar firma al documento
    const addSignatureBtn = document.getElementById('addSignatureBtn');
    if (addSignatureBtn) {
        addSignatureBtn.addEventListener('click', function() {
            if (!DocumentService.currentDocument) {
                showNotification('Primero selecciona un documento', 'error');
                return;
            }
            
            if (!AppState.currentSignature) {
                showNotification('Primero guarda una firma en el panel lateral', 'error');
                return;
            }
            
            DocumentService.setCurrentSignature(AppState.currentSignature);
        });
    }
    
    // Botones de zoom
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            DocumentService.zoomIn();
        });
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            DocumentService.zoomOut();
        });
    }
    
    // Agregar zoom con Ctrl + Rueda del mouse
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        viewerContent.addEventListener('wheel', function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    DocumentService.zoomIn();
                } else {
                    DocumentService.zoomOut();
                }
            }
        }, { passive: false });
    }
    
    // Agregar atajos de teclado para zoom
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                DocumentService.zoomIn();
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                DocumentService.zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                DocumentService.currentZoom = 1.0;
                DocumentService.applyRealZoom();
            }
        }
    });
    
    // Botón para previsualizar documento
    const previewDocumentBtn = document.getElementById('previewDocumentBtn');
    if (previewDocumentBtn) {
        previewDocumentBtn.addEventListener('click', function() {
            DocumentService.previewCombinedDocument();
        });
    }
    
    // Botón para limpiar todas las firmas
    const clearAllSignatures = document.getElementById('clearAllSignatures');
    if (clearAllSignatures) {
        clearAllSignatures.addEventListener('click', function() {
            if (DocumentService.documentSignatures.length === 0) {
                showNotification('No hay firmas para eliminar', 'warning');
                return;
            }
            
            if (confirm('¿Estás seguro de que quieres eliminar todas las firmas del documento?')) {
                DocumentService.clearAllSignatures();
            }
        });
    }
    
    // Botón para guardar documento con firmas
    const saveDocumentWithSignatures = document.getElementById('saveDocumentWithSignatures');
    if (saveDocumentWithSignatures) {
        saveDocumentWithSignatures.addEventListener('click', function() {
            if (!DocumentService.currentDocument) {
                showNotification('No hay documento seleccionado', 'error');
                return;
            }
            
            if (DocumentService.documentSignatures.length === 0) {
                showNotification('No hay firmas en el documento para guardar', 'warning');
                return;
            }
            
            DocumentService.saveDocumentWithSignatures();
        });
    }
    
    // Sistema de archivos - PÁGINA DE ARCHIVOS
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const uploadFileBtn = document.getElementById('uploadFileBtn');
    
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', function() {
            fileInput.click();
        });
    }
    
    if (uploadFileBtn && fileInput) {
        uploadFileBtn.addEventListener('click', function() {
            fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', async function() {
            if (this.files.length > 0) {
                try {
                    showNotification(`Subiendo ${this.files.length} archivo(s)...`);
                    
                    const uploadedFiles = await FileService.uploadFiles(this.files);
                    
                    // Mostrar vista previa
                    FileService.renderFilePreviews(uploadedFiles);
                    const filePreviewContainer = document.getElementById('filePreviewContainer');
                    if (filePreviewContainer) filePreviewContainer.style.display = 'block';
                    
                    // Actualizar grid de archivos
                    FileService.renderFilesGrid();
                    
                    showNotification(`${uploadedFiles.length} archivo(s) subido(s) correctamente`);
                    
                    // Limpiar input para permitir subir más archivos
                    this.value = '';
                } catch (error) {
                    console.error('Error al subir archivos:', error);
                    showNotification('Error al subir archivos', 'error');
                }
            }
        });
    }
    
    // Comentarios
    const addCommentBtn = document.getElementById('addCommentBtn');
    if (addCommentBtn) {
        addCommentBtn.addEventListener('click', function() {
            const commentInput = document.getElementById('commentInput');
            const comment = commentInput ? commentInput.value.trim() : '';
            
            if (comment) {
                const commentsSection = document.querySelector('.comments-section');
                if (!commentsSection) return;
                
                const newComment = document.createElement('div');
                newComment.className = 'comment';
                newComment.innerHTML = `
                    <div class="comment-header">
                        <span class="comment-user">${AppState.currentUser.name}</span>
                        <span class="comment-time">${new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</span>
                    </div>
                    <div>${comment}</div>
                `;
                
                const commentsContainer = commentsSection.querySelector('.comment:first-child');
                if (commentsContainer) {
                    commentsSection.insertBefore(newComment, commentsContainer.nextSibling);
                } else {
                    commentsSection.appendChild(newComment);
                }
                
                if (commentInput) commentInput.value = '';
                showNotification('Comentario agregado');
            }
        });
    }
    
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const addCommentBtn = document.getElementById('addCommentBtn');
                if (addCommentBtn) addCommentBtn.click();
            }
        });
    }
    
    // Gestión de colaboradores
    const addCollaboratorBtn = document.getElementById('addCollaboratorBtn');
    const closeCollaboratorModal = document.getElementById('closeCollaboratorModal');
    const cancelCollaboratorBtn = document.getElementById('cancelCollaboratorBtn');
    const confirmCollaboratorBtn = document.getElementById('confirmCollaboratorBtn');
    
    if (addCollaboratorBtn) {
        addCollaboratorBtn.addEventListener('click', function() {
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.add('show');
        });
    }
    
    if (closeCollaboratorModal) {
        closeCollaboratorModal.addEventListener('click', function() {
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
        });
    }
    
    if (cancelCollaboratorBtn) {
        cancelCollaboratorBtn.addEventListener('click', function() {
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
        });
    }
    
    if (confirmCollaboratorBtn) {
        confirmCollaboratorBtn.addEventListener('click', function() {
            const emailInput = document.getElementById('collaboratorEmail');
            const roleInput = document.getElementById('collaboratorRole');
            
            const email = emailInput ? emailInput.value : '';
            const role = roleInput ? roleInput.value : 'editor';
            
            if (!email) {
                showNotification('Por favor, ingresa un correo electrónico', 'error');
                return;
            }
            
            if (!validateEmail(email)) {
                showNotification('Por favor, ingresa un correo electrónico válido', 'error');
                return;
            }
            
            CollaborationService.addCollaborator(email, role);
            
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
            
            if (emailInput) emailInput.value = '';
            if (roleInput) roleInput.value = 'editor';
            
            showNotification(`Invitación enviada a ${email}`);
        });
    }
    
    // Validación de email
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('addCollaboratorModal');
        if (e.target === modal) {
            modal.classList.remove('show');
        }
        
        const previewModal = document.getElementById('previewModal');
        if (e.target === previewModal) {
            previewModal.classList.remove('show');
        }
    });
    
    // Navegación entre páginas
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.id !== 'logoutBtn') {
            link.addEventListener('click', function() {
                const pageId = this.dataset.page;
                switchPage(pageId);
            });
        }
    });
    
    // Inicializar timestamp
    updateTimestamp();
});