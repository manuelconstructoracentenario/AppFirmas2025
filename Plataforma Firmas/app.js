// Sistema de almacenamiento en la nube con Firebase
class CloudStorageService {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
    }

    // Usuarios
    async saveUser(user) {
        try {
            await this.db.collection('users').doc(user.email).set({
                ...user,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            return user;
        } catch (error) {
            console.error('Error saving user to Firebase:', error);
            throw error;
        }
    }

    async getUser(email) {
        try {
            const doc = await this.db.collection('users').doc(email).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting user from Firebase:', error);
            return null;
        }
    }

    async getAllUsers() {
        try {
            const snapshot = await this.db.collection('users').get();
            const users = {};
            snapshot.forEach(doc => {
                users[doc.id] = doc.data();
            });
            return users;
        } catch (error) {
            console.error('Error getting users from Firebase:', error);
            return {};
        }
    }

    // Documentos
    async saveDocument(doc) {
        try {
            await this.db.collection('documents').doc(doc.id).set({
                ...doc,
                uploadDate: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            return doc;
        } catch (error) {
            console.error('Error saving document to Firebase:', error);
            throw error;
        }
    }

    async getUserDocuments(userId) {
        try {
            const snapshot = await this.db.collection('documents')
                .where('uploadedBy', '==', userId)
                .orderBy('uploadDate', 'desc')
                .get();
            
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting user documents from Firebase:', error);
            return [];
        }
    }

    async getAllDocuments() {
        try {
            const snapshot = await this.db.collection('documents')
                .orderBy('uploadDate', 'desc')
                .get();
            
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting documents from Firebase:', error);
            return [];
        }
    }

    async deleteDocument(documentId) {
        try {
            await this.db.collection('documents').doc(documentId).delete();
            return true;
        } catch (error) {
            console.error('Error deleting document from Firebase:', error);
            throw error;
        }
    }

    // Actividades
    async saveActivity(activity) {
        try {
            const activityWithId = {
                ...activity,
                id: 'act_' + Date.now(),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await this.db.collection('activities').add(activityWithId);
            return activityWithId;
        } catch (error) {
            console.error('Error saving activity to Firebase:', error);
            throw error;
        }
    }

    async getRecentActivities(limit = 5) {
        try {
            const snapshot = await this.db.collection('activities')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting activities from Firebase:', error);
            return [];
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

// Sistema de Autenticación con Firebase
class AuthService {
    static async registerUser(email, password, name) {
        try {
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            const userData = {
                uid: user.uid,
                email: user.email,
                name: name,
                role: 'owner',
                avatar: name.substring(0, 2).toUpperCase(),
                createdAt: new Date(),
                permissions: ['read', 'write', 'share']
            };

            const storage = new CloudStorageService();
            await storage.saveUser(userData);
            
            await storage.saveActivity({
                type: 'user_register',
                description: `Se registró en el sistema: ${name}`,
                userName: name
            });

            return { success: true, user: userData };
        } catch (error) {
            console.error('Error en registro Firebase:', error);
            return { success: false, error: this.getAuthErrorMessage(error) };
        }
    }

    static async loginUser(email, password) {
        try {
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const firebaseUser = userCredential.user;

            const storage = new CloudStorageService();
            const userData = await storage.getUser(firebaseUser.email);

            if (!userData) {
                return { success: false, error: 'Usuario no encontrado en la base de datos' };
            }

            await storage.saveActivity({
                type: 'user_login',
                description: `Inició sesión en el sistema`,
                userName: userData.name
            });

            return { 
                success: true, 
                user: userData
            };
        } catch (error) {
            console.error('Error en login Firebase:', error);
            return { success: false, error: this.getAuthErrorMessage(error) };
        }
    }

    static getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                return 'Ya existe una cuenta con este correo electrónico';
            case 'auth/invalid-email':
                return 'El correo electrónico no es válido';
            case 'auth/operation-not-allowed':
                return 'La operación no está permitida';
            case 'auth/weak-password':
                return 'La contraseña es demasiado débil';
            case 'auth/user-disabled':
                return 'La cuenta ha sido deshabilitada';
            case 'auth/user-not-found':
                return 'No existe una cuenta con este correo';
            case 'auth/wrong-password':
                return 'La contraseña es incorrecta';
            case 'auth/network-request-failed':
                return 'Error de conexión. Verifica tu internet';
            default:
                return 'Error en la autenticación: ' + error.message;
        }
    }

    static logout() {
        firebase.auth().signOut();
        AppState.currentUser = null;
        AppState.currentDocument = null;
        AppState.documentSignatures = [];
        
        showNotification('Sesión cerrada correctamente');
        
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').classList.remove('active');
    }

    static getCurrentUser() {
        return AppState.currentUser;
    }

    static setCurrentUser(user) {
        AppState.currentUser = user;
    }

    static initAuthListener() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                console.log('Usuario autenticado:', user.email);
                const storage = new CloudStorageService();
                const userData = await storage.getUser(user.email);
                
                if (userData) {
                    AuthService.setCurrentUser(userData);
                    
                    const currentUserName = document.getElementById('currentUserName');
                    const userAvatar = document.getElementById('userAvatar');
                    const userRoleBadge = document.getElementById('userRoleBadge');
                    
                    if (currentUserName) currentUserName.textContent = userData.name;
                    if (userAvatar) userAvatar.textContent = userData.avatar;
                    if (userRoleBadge) {
                        userRoleBadge.textContent = 'Propietario';
                    }
                    
                    try {
                        const autoSignature = await SignatureGenerator.createUserSignature(userData);
                        AppState.currentSignature = autoSignature;
                        updateAutoSignaturePreview();
                    } catch (error) {
                        console.error('Error generating signature:', error);
                    }
                    
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('appContainer').classList.add('active');
                    
                    CollaborationService.updateOnlineUsers();
                    CollaborationService.renderCollaborators();
                    FileService.renderFilesGrid();
                    DocumentService.renderDocumentSelector();
                    ActivityService.loadRecentActivities();
                    
                    showNotification(`¡Bienvenido a Cente Docs, ${userData.name}!`);
                }
            } else {
                console.log('No hay usuario autenticado');
                AppState.currentUser = null;
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('appContainer').classList.remove('active');
            }
        });
    }
}

// Sistema de Gestión de Archivos
class FileService {
    static files = [];
    
    static async uploadFiles(files) {
        const uploadedFiles = [];
        const storage = new CloudStorageService();
        
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
        
        DocumentService.refreshDocumentSelector();
        
        return uploadedFiles;
    }
    
    static async loadUserDocuments() {
        try {
            const storage = new CloudStorageService();
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
            const storage = new CloudStorageService();
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
                    <button class="file-preview-btn" onclick="FileService.editOrSignFile('${file.id}')" title="Editar/Firmar">
                        <i class="fas fa-edit"></i>
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
                    <div>Subido: ${new Date(file.uploadDate?.toDate?.() || file.uploadDate).toLocaleDateString('es-ES')}</div>
                    <div>Tamaño: ${this.formatFileSize(file.size)}</div>
                    <div>Por: ${file.uploadedByName}</div>
                    <div>Tipo: ${this.getFileTypeDisplayName(fileInfo.type)}</div>
                    ${file.source === 'signed' ? '<div class="file-status-signed">✓ Documento firmado</div>' : ''}
                </div>
                <div class="file-actions">
                    <button class="file-action-btn" onclick="FileService.downloadFile('${file.id}')">
                        <i class="fas fa-download"></i> Descargar
                    </button>
                    <button class="file-action-btn highlight" onclick="FileService.editOrSignFile('${file.id}')">
                        <i class="fas fa-edit"></i> Editar/Firmar
                    </button>
                    <button class="file-action-btn" onclick="FileService.shareFile('${file.id}')">
                        <i class="fas fa-share"></i> Compartir
                    </button>
                </div>
            `;
            filesGrid.appendChild(fileCard);
        });
    }

    static async editOrSignFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            switchPage('documents');
            
            setTimeout(async () => {
                await DocumentService.loadDocument(file);
                showNotification(`Documento "${file.name}" cargado para edición/firma`);
            }, 100);
        }
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
                const storage = new CloudStorageService();
                await storage.deleteDocument(fileId);
                
                this.files = this.files.filter(f => f.id !== fileId);
                this.renderFilesGrid();
                DocumentService.renderDocumentSelector();
                
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
            const storage = new CloudStorageService();
            
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
            
            await storage.saveActivity({
                type: 'document_signed',
                description: `Firmó el documento: ${fileName}`,
                documentName: fileName,
                userName: AppState.currentUser.name
            });
            
            await this.loadUserDocuments();
            this.renderFilesGrid();
            DocumentService.renderDocumentSelector();
            
            return signedFile;
        } catch (error) {
            console.error('Error adding signed document:', error);
            throw error;
        }
    }

    static filterFiles(searchTerm) {
        const fileCards = document.querySelectorAll('.file-card');
        let visibleCount = 0;
        
        fileCards.forEach(card => {
            const fileName = card.querySelector('.file-name').textContent.toLowerCase();
            if (fileName.includes(searchTerm)) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });
        
        const filesCount = document.getElementById('filesCount');
        if (filesCount) {
            filesCount.textContent = `${visibleCount} archivo${visibleCount !== 1 ? 's' : ''}`;
        }
        
        const noFiles = document.getElementById('noFiles');
        const filesGrid = document.getElementById('filesGrid');
        if (noFiles && filesGrid) {
            if (visibleCount === 0 && searchTerm) {
                if (!document.getElementById('noSearchResults')) {
                    const noResults = document.createElement('div');
                    noResults.id = 'noSearchResults';
                    noResults.className = 'no-files';
                    noResults.innerHTML = `
                        <div class="no-files-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <h3>No se encontraron archivos</h3>
                        <p>No hay archivos que coincidan con "${searchTerm}"</p>
                    `;
                    filesGrid.appendChild(noResults);
                }
            } else {
                const noResults = document.getElementById('noSearchResults');
                if (noResults) {
                    noResults.remove();
                }
            }
        }
    }
}

// Sistema de Generación de Firmas Automáticas
class SignatureGenerator {
    static generateAutomaticSignature(user) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const width = 500;
            const height = 120;
            canvas.width = width;
            canvas.height = height;
            
            ctx.clearRect(0, 0, width, height);
            
            const name = user.name;
            let nameLines = this.splitNameForLeftSide(name);
            
            const leftWidth = 250;
            
            ctx.font = 'bold 22px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#2f6c46';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            let nameY = (height - (nameLines.length * 26)) / 2;
            nameLines.forEach(line => {
                ctx.fillText(line, 15, nameY);
                nameY += 26;
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
                `Fecha: ${formattedDate}`
            ];
            
            let y = 25;
            const rightStartX = leftWidth + 15;
            
            lines.forEach(line => {
                if (line.startsWith('Firmado digitalmente')) {
                    ctx.font = 'bold 14px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                } else if (line === user.name) {
                    ctx.font = 'bold 16px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                    ctx.fillStyle = '#2f6c46';
                } else {
                    ctx.font = '14px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                    ctx.fillStyle = '#333333';
                }
                
                ctx.fillText(line, rightStartX, y);
                y += 22;
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
                this.documentSignatures = [];
                this.currentSignature = null;
                this.currentZoom = 1.0;

                const signatureLayer = document.getElementById('signatureLayer');
                if (signatureLayer) {
                    signatureLayer.innerHTML = '';
                }

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
                
                if (file.signatures && file.signatures.length > 0) {
                    this.documentSignatures = [...file.signatures];
                }
                
                setTimeout(async () => {
                    try {
                        await this.renderDocument();
                        this.renderDocumentSelector();
                        this.renderSignaturesList();
                        this.initializeDocumentInteractions();
                        
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
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            this.showLoadingMessage(canvas, ctx);

            if (this.currentDocument.type === 'application/pdf') {
                await this.renderPDFDocument(canvas, ctx);
            } else if (this.currentDocument.type.startsWith('image/')) {
                await this.renderImageDocument(canvas, ctx);
            } else {
                await this.renderGenericDocument(canvas, ctx);
            }

            this.renderExistingSignatures();
            
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
            
            this.currentZoom = 1.0;
            this.applyRealZoom();
            
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
            
            const optimalSize = this.calculateOptimalDocumentSize(originalWidth, originalHeight, 1.5);
            
            canvas.width = optimalSize.width;
            canvas.height = optimalSize.height;
            
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
                
                const optimalSize = this.calculateOptimalDocumentSize(originalWidth, originalHeight, 1.2);
                
                canvas.width = optimalSize.width;
                canvas.height = optimalSize.height;
                
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
            const originalWidth = canvas.width;
            const originalHeight = canvas.height;
            
            const scaledWidth = originalWidth * this.currentZoom;
            const scaledHeight = originalHeight * this.currentZoom;
            
            canvas.style.width = scaledWidth + 'px';
            canvas.style.height = scaledHeight + 'px';
            
            container.style.width = scaledWidth + 'px';
            container.style.height = scaledHeight + 'px';
            
            if (signatureLayer) {
                signatureLayer.style.width = scaledWidth + 'px';
                signatureLayer.style.height = scaledHeight + 'px';
            }
            
            this.repositionSignaturesForZoom();
        }
        
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    static repositionSignaturesForZoom() {
        const canvas = document.getElementById('documentCanvas');
        if (!canvas) return;
        
        const originalWidth = canvas.width / this.currentZoom;
        const originalHeight = canvas.height / this.currentZoom;
        
        this.documentSignatures.forEach(signature => {
            const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
            if (signatureElement) {
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
                width = 250;
                height = 90;
            }

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
        
        if (sortedFiles.length > 0 && (!this.currentDocument || selector.value === "")) {
            selector.value = sortedFiles[0].id;
            const event = new Event('change');
            selector.dispatchEvent(event);
        }
    }

    static refreshDocumentSelector() {
        this.renderDocumentSelector();
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

    static loadUserSettings() {
        if (!AppState.currentUser) return;
        
        const userFullName = document.getElementById('userFullName');
        const userEmail = document.getElementById('userEmail');
        
        if (userFullName) userFullName.value = AppState.currentUser.name;
        if (userEmail) userEmail.value = AppState.currentUser.email;
        
        if (userFullName) {
            userFullName.addEventListener('change', function() {
                AppState.currentUser.name = this.value;
                const storage = new CloudStorageService();
                storage.getUser(AppState.currentUser.email).then(user => {
                    if (user) {
                        user.name = this.value;
                        storage.saveUser(user);
                    }
                });
                showNotification('Nombre actualizado correctamente');
            });
        }
        
        if (userEmail) {
            userEmail.addEventListener('change', function() {
                showNotification('El correo electrónico no se puede modificar', 'warning');
                this.value = AppState.currentUser.email;
            });
        }
    }
}

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
                const loadingTask = pdfjsLib.getDocument(DocumentService.currentDocument.url);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                
                const scale = 2.0;
                const viewport = page.getViewport({ scale });
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;

                const displayCanvas = document.getElementById('documentCanvas');
                const signatureLayer = document.getElementById('signatureLayer');
                
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
                        
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, x, y, width, height);
                    }
                }

                const { jsPDF } = window.jspdf;
                const pdfOutput = new jsPDF({
                    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [canvas.width, canvas.height]
                });

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
                const img = new Image();
                img.src = DocumentService.currentDocument.url;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
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
                    const highQualityCanvas = document.createElement('canvas');
                    const ctx = highQualityCanvas.getContext('2d');
                    
                    highQualityCanvas.width = canvas.width;
                    highQualityCanvas.height = canvas.height;
                    
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
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
        
        DocumentExportService.downloadCombinedDocument(result.blob, result.fileName);
        
        await FileService.addSignedDocument(
            this.currentDocument.id,
            result.blob,
            result.fileName,
            this.documentSignatures
        );
        
        this.documentSignatures = [];
        this.renderExistingSignatures();
        this.renderSignaturesList();
        
        showNotification('Documento firmado guardado exitosamente en alta calidad.');

    } catch (error) {
        console.error('Error al guardar documento con firmas:', error);
        showNotification('Error al guardar el documento: ' + error.message, 'error');
    }
};

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
            const storage = new CloudStorageService();
            const activities = await storage.getRecentActivities(5);
            this.renderActivities(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }
    
    static renderActivities(activities) {
        const activityFeed = document.querySelector('.activity-feed');
        if (!activityFeed) return;
        
        const activityItems = activityFeed.querySelectorAll('.activity-item');
        activityItems.forEach(item => item.remove());
        
        const limitedActivities = activities.slice(0, 5);
        
        limitedActivities.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            
            const icon = this.getActivityIcon(activity.type);
            const time = new Date(activity.timestamp?.toDate?.() || activity.timestamp).toLocaleTimeString('es-ES', {
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
    static collaborators = [];

    static async updateOnlineUsers() {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;
        
        usersList.innerHTML = '';
        
        try {
            const storage = new CloudStorageService();
            const allUsers = await storage.getAllUsers();
            
            Object.values(allUsers).forEach(user => {
                const userItem = document.createElement('li');
                userItem.className = 'user-item';
                userItem.innerHTML = `
                    <div class="user-status ${user.email === AppState.currentUser?.email ? 'online' : 'away'}"></div>
                    <div>${user.name} 
                        <span class="permission-badge permission-${user.role}">
                            ${user.role === 'owner' ? 'Propietario' : 'Usuario'}
                        </span>
                    </div>
                `;
                usersList.appendChild(userItem);
            });
            
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
        } catch (error) {
            console.error('Error loading online users:', error);
        }
    }

    static async renderCollaborators() {
        const collaboratorsList = document.getElementById('collaboratorsList');
        const collaboratorsCount = document.getElementById('collaboratorsCount');
        
        if (!collaboratorsList || !collaboratorsCount) return;
        
        try {
            const storage = new CloudStorageService();
            const allUsers = await storage.getAllUsers();
            const collaborators = Object.values(allUsers);
            
            collaboratorsCount.textContent = `${collaborators.length} miembro${collaborators.length !== 1 ? 's' : ''}`;
            collaboratorsList.innerHTML = '';
            
            collaborators.forEach(user => {
                const collaboratorItem = document.createElement('div');
                collaboratorItem.className = 'collaborator-item';
                collaboratorItem.innerHTML = `
                    <div class="collaborator-avatar">${user.avatar}</div>
                    <div class="collaborator-details">
                        <div class="collaborator-name">${user.name}</div>
                        <div class="collaborator-email">${user.email}</div>
                        <div class="user-role-badge permission-${user.role}">
                            ${user.role === 'owner' ? 'Propietario' : 'Usuario'}
                        </div>
                    </div>
                    <div class="collaborator-actions">
                        ${user.email !== AppState.currentUser?.email ? `
                        <button class="btn btn-outline" onclick="CollaborationService.removeCollaborator('${user.email}')">
                            Remover
                        </button>
                        ` : ''}
                    </div>
                `;
                collaboratorsList.appendChild(collaboratorItem);
            });
            
        } catch (error) {
            console.error('Error loading collaborators:', error);
        }
    }
    
    static async removeCollaborator(email) {
        if (email === AppState.currentUser?.email) {
            showNotification('No puedes removerte a ti mismo', 'error');
            return;
        }
        
        if (confirm(`¿Estás seguro de que quieres remover a este colaborador?`)) {
            try {
                showNotification('Funcionalidad de remover colaboradores en desarrollo', 'warning');
            } catch (error) {
                console.error('Error removing collaborator:', error);
                showNotification('Error al remover colaborador', 'error');
            }
        }
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
    
    if (pageId === 'files') {
        FileService.renderFilesGrid();
    } else if (pageId === 'collaborators') {
        CollaborationService.renderCollaborators();
    } else if (pageId === 'documents') {
        ActivityService.loadRecentActivities();
    } else if (pageId === 'settings') {
        DocumentService.loadUserSettings();
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
    AuthService.initAuthListener();

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
                    showNotification(`¡Bienvenido a Cente Docs, ${result.user.name}!`);
                } else {
                    showNotification(result.error, 'error');
                }
            } catch (error) {
                showNotification('Error en el inicio de sesión', 'error');
            }
        });
    }
    
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
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            AuthService.logout();
        });
    }
    
    document.querySelectorAll('.signature-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            document.querySelectorAll('.signature-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.signature-tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const content = document.getElementById(`${tabId}-tab`);
            if (content) content.classList.add('active');
        });
    });
    
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
                
                const signaturePreview = document.getElementById('signaturePreview');
                if (signaturePreview) {
                    signaturePreview.src = autoSignature.data;
                }
                
                updateAutoSignaturePreview();
                
                showNotification('Firma automática actualizada');
            } catch (error) {
                console.error('Error al actualizar firma automática:', error);
                showNotification('Error al actualizar firma automática', 'error');
            }
        });
    }
    
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
                
                const uploadedFiles = await FileService.uploadFiles(this.files);
                
                if (uploadedFiles.length > 0) {
                    await DocumentService.loadDocument(uploadedFiles[0]);
                    showNotification(`Documento subido correctamente`);
                }
                
                if (document.getElementById('files-page') && 
                    document.getElementById('files-page').classList.contains('active')) {
                    FileService.renderFilesGrid();
                }
                
                this.value = '';
                
            } catch (error) {
                console.error('Error al subir documento:', error);
                showNotification('Error al subir documento', 'error');
            }
        }
    });
    
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
    
    const previewDocumentBtn = document.getElementById('previewDocumentBtn');
    if (previewDocumentBtn) {
        previewDocumentBtn.addEventListener('click', function() {
            DocumentService.previewCombinedDocument();
        });
    }
    
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
                    
                    FileService.renderFilePreviews(uploadedFiles);
                    const filePreviewContainer = document.getElementById('filePreviewContainer');
                    if (filePreviewContainer) filePreviewContainer.style.display = 'block';
                    
                    FileService.renderFilesGrid();
                    
                    showNotification(`${uploadedFiles.length} archivo(s) subido(s) correctamente`);
                    
                    this.value = '';
                } catch (error) {
                    console.error('Error al subir archivos:', error);
                    showNotification('Error al subir archivos', 'error');
                }
            }
        });
    }
    
    const fileSearchInput = document.getElementById('fileSearchInput');
    if (fileSearchInput) {
        fileSearchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            FileService.filterFiles(searchTerm);
        });
    }
    
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
            
            showNotification(`Invitación enviada a ${email}`);
            
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
            
            if (emailInput) emailInput.value = '';
            if (roleInput) roleInput.value = 'editor';
        });
    }
    
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
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
    
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.id !== 'logoutBtn') {
            link.addEventListener('click', function() {
                const pageId = this.dataset.page;
                switchPage(pageId);
            });
        }
    });
    
    updateTimestamp();
});