// ===== CONFIGURACIÓN Y ESTADO GLOBAL =====
let currentUser = null;
let currentDocument = null;
let documents = [];
let documentSignatures = [];
let currentSignature = null;
let currentZoom = 1.0;

// ===== CLASE DE SERVICIO DE ALMACENAMIENTO EN LA NUBE =====
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
            // Fallback a localStorage
            this.saveToLocalStorage('users', user.email, user);
            return user;
        }
    }

    async getUser(email) {
        try {
            const doc = await this.db.collection('users').doc(email).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting user from Firebase:', error);
            // Fallback a localStorage
            return this.getFromLocalStorage('users', email);
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
            return this.getAllFromLocalStorage('users');
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
            // Fallback a localStorage
            this.saveToLocalStorage('documents', doc.id, doc);
            return doc;
        }
    }

    async getUserDocuments(userId) {
        try {
            const snapshot = await this.db.collection('documents')
                .where('uploadedBy', '==', userId)
                .orderBy('uploadDate', 'desc')
                .get();
            
            const docs = snapshot.docs.map(doc => doc.data());
            return docs;
        } catch (error) {
            console.error('Error getting user documents from Firebase:', error);
            // Fallback a localStorage
            const allDocs = this.getAllFromLocalStorage('documents');
            return Object.values(allDocs).filter(doc => doc.uploadedBy === userId);
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
            // Fallback a localStorage
            const allDocs = this.getAllFromLocalStorage('documents');
            return Object.values(allDocs).sort((a, b) => 
                new Date(b.uploadDate) - new Date(a.uploadDate)
            );
        }
    }

    async deleteDocument(documentId) {
        try {
            await this.db.collection('documents').doc(documentId).delete();
            return true;
        } catch (error) {
            console.error('Error deleting document from Firebase:', error);
            // Fallback a localStorage
            return this.deleteFromLocalStorage('documents', documentId);
        }
    }

    // Métodos de localStorage para fallback
    saveToLocalStorage(collection, key, data) {
        try {
            const storageKey = `centeDocs_${collection}`;
            const stored = localStorage.getItem(storageKey);
            const items = stored ? JSON.parse(stored) : {};
            items[key] = { ...data, _local: true };
            localStorage.setItem(storageKey, JSON.stringify(items));
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    }

    getFromLocalStorage(collection, key) {
        try {
            const storageKey = `centeDocs_${collection}`;
            const stored = localStorage.getItem(storageKey);
            const items = stored ? JSON.parse(stored) : {};
            return items[key] || null;
        } catch (error) {
            console.error('Error getting from localStorage:', error);
            return null;
        }
    }

    getAllFromLocalStorage(collection) {
        try {
            const storageKey = `centeDocs_${collection}`;
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error getting all from localStorage:', error);
            return {};
        }
    }

    deleteFromLocalStorage(collection, key) {
        try {
            const storageKey = `centeDocs_${collection}`;
            const stored = localStorage.getItem(storageKey);
            if (!stored) return false;
            
            const items = JSON.parse(stored);
            delete items[key];
            localStorage.setItem(storageKey, JSON.stringify(items));
            return true;
        } catch (error) {
            console.error('Error deleting from localStorage:', error);
            return false;
        }
    }
}

// ===== SISTEMA DE AUTENTICACIÓN =====
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
        currentUser = null;
        currentDocument = null;
        documentSignatures = [];
        
        showNotification('Sesión cerrada correctamente');
        
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }

    static initAuthListener() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                console.log('Usuario autenticado:', user.email);
                const storage = new CloudStorageService();
                const userData = await storage.getUser(user.email);
                
                if (userData) {
                    currentUser = userData;
                    
                    // Actualizar interfaz de usuario
                    const currentUserName = document.getElementById('currentUserName');
                    const userAvatar = document.getElementById('userAvatar');
                    const userRoleBadge = document.getElementById('userRoleBadge');
                    
                    if (currentUserName) currentUserName.textContent = userData.name;
                    if (userAvatar) userAvatar.textContent = userData.avatar;
                    if (userRoleBadge) {
                        userRoleBadge.textContent = 'Propietario';
                    }
                    
                    // Generar firma automática
                    await SignatureGenerator.createUserSignature(userData).then(signature => {
                        currentSignature = signature;
                        updateAutoSignaturePreview();
                    }).catch(error => {
                        console.error('Error generating signature:', error);
                    });
                    
                    // Mostrar aplicación
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('appContainer').style.display = 'flex';
                    
                    // Cargar datos iniciales
                    CollaborationService.renderCollaborators();
                    FileService.loadAllDocuments();
                    DocumentService.renderDocumentSelector();
                    
                    showNotification(`¡Bienvenido a Cente Docs, ${userData.name}!`);
                }
            } else {
                console.log('No hay usuario autenticado');
                currentUser = null;
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('appContainer').style.display = 'none';
            }
        });
    }
}

// ===== SISTEMA DE GESTIÓN DE ARCHIVOS (REVISADO) =====
class FileService {
    static files = [];
    static uploadedFiles = [];
    static signedDocuments = [];
    
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
                    uploadedBy: currentUser.uid,
                    uploadedByName: currentUser.name,
                    signatures: [],
                    extension: file.name.split('.').pop().toLowerCase(),
                    source: 'uploaded',
                    category: 'uploaded'
                };
                
                await storage.saveDocument(fileData);
                uploadedFiles.push(fileData);
                
                await storage.saveActivity({
                    type: 'file_upload',
                    description: `Subió el archivo: ${file.name}`,
                    documentName: file.name,
                    userName: currentUser.name
                });
                
                showNotification(`Archivo "${file.name}" subido correctamente`);
                
            } catch (error) {
                console.error('Error uploading file:', error);
                showNotification(`Error al subir ${file.name}`, 'error');
            }
        }
        
        // Actualizar listas
        await this.loadAllDocuments();
        this.renderFilesGrid();
        DocumentService.renderDocumentSelector();
        
        return uploadedFiles;
    }
    
    static async loadAllDocuments() {
        try {
            const storage = new CloudStorageService();
            const allDocuments = await storage.getAllDocuments();
            
            // Separar archivos por categoría
            this.files = allDocuments;
            this.uploadedFiles = allDocuments.filter(doc => doc.category === 'uploaded' || doc.source === 'uploaded');
            this.signedDocuments = allDocuments.filter(doc => doc.category === 'signed' || doc.source === 'signed');
            
            return allDocuments;
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
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    static async renderFilesGrid() {
        const filesGrid = document.getElementById('filesGrid');
        const noFiles = document.getElementById('noFiles');
        const filesCount = document.getElementById('filesCount');
        
        if (!filesGrid || !noFiles || !filesCount) return;
        
        await this.loadAllDocuments();
        
        const totalCount = this.files.length;
        const uploadedCount = this.uploadedFiles.length;
        const signedCount = this.signedDocuments.length;
        
        filesCount.textContent = `${totalCount} archivos (${uploadedCount} subidos, ${signedCount} firmados)`;
        
        if (totalCount === 0) {
            noFiles.style.display = 'block';
            filesGrid.innerHTML = '';
            filesGrid.appendChild(noFiles);
            return;
        }
        
        noFiles.style.display = 'none';
        filesGrid.innerHTML = '';
        
        // Mostrar documentos firmados primero
        if (signedCount > 0) {
            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'files-section-header';
            sectionHeader.innerHTML = `<h4><i class="fas fa-file-signature"></i> Documentos Firmados (${signedCount})</h4>`;
            filesGrid.appendChild(sectionHeader);
            
            this.signedDocuments.forEach(file => {
                const fileCard = this.createFileCard(file, true);
                filesGrid.appendChild(fileCard);
            });
        }
        
        // Mostrar documentos subidos
        if (uploadedCount > 0) {
            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'files-section-header';
            sectionHeader.innerHTML = `<h4><i class="fas fa-file-upload"></i> Documentos para Firmar (${uploadedCount})</h4>`;
            filesGrid.appendChild(sectionHeader);
            
            this.uploadedFiles.forEach(file => {
                const fileCard = this.createFileCard(file, false);
                filesGrid.appendChild(fileCard);
            });
        }
    }
    
    static createFileCard(file, isSigned) {
        const fileInfo = this.getFileIcon(file.type, file.name);
        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';
        fileCard.dataset.fileId = file.id;
        
        const signedBadge = isSigned ? 
            '<div class="signed-badge"><i class="fas fa-signature"></i> Firmado</div>' : 
            '';
        
        const statusBadge = isSigned ? 
            '<span class="file-status-badge signed">Firmado</span>' : 
            '<span class="file-status-badge uploaded">Por firmar</span>';
        
        fileCard.innerHTML = `
            <div class="file-icon">
                <i class="${fileInfo.icon}" style="color: ${fileInfo.color};"></i>
                ${statusBadge}
            </div>
            ${signedBadge}
            <div class="file-name">${file.name}</div>
            <div class="file-info">
                <div><i class="far fa-calendar"></i> ${new Date(file.uploadDate?.toDate?.() || file.uploadDate).toLocaleDateString('es-ES')}</div>
                <div><i class="far fa-file"></i> ${this.formatFileSize(file.size)}</div>
                <div><i class="fas fa-user"></i> ${file.uploadedByName || currentUser.name}</div>
                ${isSigned && file.signedBy ? `<div><i class="fas fa-signature"></i> Firmado por: ${file.signedBy}</div>` : ''}
            </div>
            <div class="file-actions">
                <button class="file-action-btn" onclick="FileService.downloadFile('${file.id}')">
                    <i class="fas fa-download"></i> Descargar
                </button>
                <button class="file-action-btn" onclick="FileService.previewFile('${file.id}')">
                    <i class="fas fa-eye"></i> Ver
                </button>
                ${!isSigned ? `
                <button class="file-action-btn highlight" onclick="FileService.editOrSignFile('${file.id}')">
                    <i class="fas fa-signature"></i> Firmar
                </button>
                ` : ''}
            </div>
        `;
        
        return fileCard;
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
    
    static async previewFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            showNotification(`Abriendo vista previa de: ${file.name}`, 'success');
            // Aquí implementarías la lógica de previsualización real
        }
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
                uploadedBy: currentUser.uid,
                uploadedByName: currentUser.name,
                signatures: signatures,
                extension: fileName.split('.').pop().toLowerCase(),
                source: 'signed',
                category: 'signed',
                originalFileId: originalFileId,
                signedBy: currentUser.name,
                signedAt: new Date().toLocaleString('es-ES')
            };

            await storage.saveDocument(signedFile);
            
            await storage.saveActivity({
                type: 'document_signed',
                description: `Firmó el documento: ${fileName}`,
                documentName: fileName,
                userName: currentUser.name
            });
            
            // Actualizar listas
            await this.loadAllDocuments();
            this.renderFilesGrid();
            DocumentService.renderDocumentSelector();
            
            showNotification(`Documento firmado "${fileName}" guardado correctamente`);
            
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
        
        // Ocultar secciones vacías
        const sections = document.querySelectorAll('.files-section-header');
        sections.forEach(section => {
            let hasVisible = false;
            let nextElement = section.nextElementSibling;
            
            while (nextElement && !nextElement.classList.contains('files-section-header')) {
                if (nextElement.style.display !== 'none') {
                    hasVisible = true;
                    break;
                }
                nextElement = nextElement.nextElementSibling;
            }
            
            if (!hasVisible) {
                section.style.display = 'none';
            } else {
                section.style.display = 'block';
            }
        });
        
        const filesCount = document.getElementById('filesCount');
        if (filesCount) {
            const totalFiles = this.files.length;
            filesCount.textContent = `${visibleCount} de ${totalFiles} archivos`;
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

// ===== SISTEMA DE GENERACIÓN DE FIRMAS AUTOMÁTICAS =====
class SignatureGenerator {
    static async createUserSignature(user) {
        try {
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
            
            return {
                data: dataURL,
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
}

// ===== SISTEMA DE GESTIÓN DE DOCUMENTOS Y FIRMAS (REVISADO) =====
class DocumentService {
    static currentDocument = null;
    static currentZoom = 1.0;
    static isSignatureMode = false;
    static documentSignatures = [];
    static isDraggingSignature = false;
    static currentDraggingSignature = null;
    static canvasClickHandler = null;

    static async loadDocument(file) {
        try {
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
                uploadedBy: file.uploadedBy || currentUser.uid,
                uploadedByName: file.uploadedByName || currentUser.name,
                signatures: [],
                pages: file.pages || 1,
                size: file.size,
                extension: file.extension,
                source: file.source || 'uploaded'
            };
            
            if (file.signatures && file.signatures.length > 0) {
                this.documentSignatures = [...file.signatures];
            }
            
            await this.renderDocument();
            this.renderSignaturesList();
            this.initializeDocumentInteractions();
            this.applyRealZoom();
            
            showNotification(`Documento "${file.name}" cargado correctamente`);
            
            return this.currentDocument;
        } catch (error) {
            console.error('Error al cargar documento:', error);
            showNotification('Error al cargar el documento', 'error');
            return null;
        }
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
            
            // Mostrar documento simulado para demo
            canvas.width = 800;
            canvas.height = 1000;
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Contorno del documento
            ctx.strokeStyle = '#e1e5e9';
            ctx.lineWidth = 2;
            ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
            
            // Título del documento
            ctx.fillStyle = '#2f6c46';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.currentDocument.name, canvas.width / 2, 80);
            
            // Contenido simulado
            ctx.fillStyle = '#333';
            ctx.font = '16px Arial';
            ctx.textAlign = 'left';
            
            const contentLines = [
                'DOCUMENTO DE DEMOSTRACIÓN',
                '',
                'Este es el contenido del documento cargado en el sistema.',
                'En una implementación real, aquí se mostraría el PDF o imagen real.',
                '',
                `Nombre: ${this.currentDocument.name}`,
                `Tipo: ${this.currentDocument.type}`,
                `Tamaño: ${FileService.formatFileSize(this.currentDocument.size)}`,
                `Subido por: ${this.currentDocument.uploadedByName}`,
                `Fecha: ${new Date(this.currentDocument.uploadDate).toLocaleDateString('es-ES')}`,
                '',
                'Puedes agregar firmas digitales utilizando el panel lateral.'
            ];
            
            let y = 150;
            contentLines.forEach(line => {
                ctx.fillText(line, 60, y);
                y += 30;
            });
            
            this.renderExistingSignatures();
            this.adjustContainerSize();
            
        } catch (error) {
            console.error('Error al renderizar documento:', error);
            showNotification('Error al mostrar el documento', 'error');
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
            }
        }
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
        }
        
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    static renderExistingSignatures() {
        const signatureLayer = document.getElementById('signatureLayer');
        if (!signatureLayer) return;
        
        signatureLayer.innerHTML = '';
        
        this.documentSignatures.forEach(signature => {
            const signatureElement = this.createSignatureElement(signature);
            signatureLayer.appendChild(signatureElement);
        });
    }

    static createSignatureElement(signature) {
        const signatureElement = document.createElement('div');
        signatureElement.className = 'document-signature';
        signatureElement.style.left = (signature.x || 100) + 'px';
        signatureElement.style.top = (signature.y || 700) + 'px';
        signatureElement.style.width = (signature.width || 250) + 'px';
        signatureElement.style.height = (signature.height || 100) + 'px';
        signatureElement.dataset.signatureId = signature.id;
        
        signatureElement.innerHTML = `
            <img src="${signature.data}" alt="Firma de ${signature.userName}" 
                 style="width: 100%; height: 100%; object-fit: contain; background: transparent;">
        `;
        
        return signatureElement;
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

    static renderDocumentSelector() {
        const selector = document.getElementById('documentSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">Seleccionar documento...</option>';
        
        // Mostrar solo documentos subidos (no firmados)
        const uploadedFiles = FileService.uploadedFiles.filter(file => 
            file.source === 'uploaded' || file.category === 'uploaded'
        );
        
        uploadedFiles.forEach(file => {
            const fileInfo = FileService.getFileIcon(file.type, file.name);
            const option = document.createElement('option');
            option.value = file.id;
            option.textContent = `${file.name} (${FileService.formatFileSize(file.size)})`;
            selector.appendChild(option);
        });
        
        // Si hay documentos, seleccionar el primero
        if (uploadedFiles.length > 0 && (!this.currentDocument || selector.value === "")) {
            selector.value = uploadedFiles[0].id;
        }
    }

    static setCurrentSignature(signatureData) {
        currentSignature = signatureData;
        this.enableSignatureMode();
    }

    static enableSignatureMode() {
        this.isSignatureMode = true;
        document.body.classList.add('signature-mode-active');
        
        const canvas = document.getElementById('documentCanvas');
        if (canvas) canvas.style.cursor = 'crosshair';
        
        showNotification('Modo firma activado - Haz clic en el documento para colocar tu firma');
    }

    static addSignatureToDocument(x, y) {
        if (!currentSignature) {
            showNotification('No hay firma seleccionada', 'error');
            return;
        }

        const signature = {
            id: 'sig_' + Date.now(),
            data: currentSignature.data,
            userName: currentUser.name,
            userEmail: currentUser.email,
            x: x - 125,
            y: y - 50,
            width: 250,
            height: 100,
            timestamp: new Date(),
            type: currentSignature.type
        };
        
        this.documentSignatures.push(signature);
        this.renderExistingSignatures();
        this.renderSignaturesList();
        
        showNotification('Firma agregada al documento');
        this.disableSignatureMode();
    }

    static disableSignatureMode() {
        this.isSignatureMode = false;
        document.body.classList.remove('signature-mode-active');
        
        const canvas = document.getElementById('documentCanvas');
        if (canvas) canvas.style.cursor = 'default';
    }

    static async saveDocumentWithSignatures() {
        if (!this.currentDocument) {
            showNotification('No hay documento seleccionado', 'error');
            return;
        }
        
        if (this.documentSignatures.length === 0) {
            showNotification('No hay firmas en el documento para guardar', 'warning');
            return;
        }
        
        showNotification('Guardando documento con firmas...');
        
        try {
            // Crear un blob del documento con firmas (simulado)
            const canvas = document.getElementById('documentCanvas');
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
            
            // Crear nombre para el documento firmado
            const fileName = `FIRMADO_${this.currentDocument.name}`;
            
            // Guardar como nuevo documento firmado
            await FileService.addSignedDocument(
                this.currentDocument.id,
                blob,
                fileName,
                this.documentSignatures
            );
            
            // Limpiar firmas
            this.documentSignatures = [];
            this.renderExistingSignatures();
            this.renderSignaturesList();
            
            showNotification('Documento firmado guardado correctamente en la sección de documentos firmados');
            
        } catch (error) {
            console.error('Error al guardar documento con firmas:', error);
            showNotification('Error al guardar el documento', 'error');
        }
    }

    static clearAllSignatures() {
        this.documentSignatures = [];
        this.renderExistingSignatures();
        this.renderSignaturesList();
        showNotification('Todas las firmas removidas', 'warning');
    }

    static initializeDocumentInteractions() {
        const canvas = document.getElementById('documentCanvas');
        if (canvas) {
            canvas.addEventListener('click', (e) => {
                if (this.isSignatureMode) {
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    this.addSignatureToDocument(x, y);
                }
            });
        }
    }
}

// ===== SISTEMA DE COLABORACIÓN (SIN BOTÓN DE REMOVER) =====
class CollaborationService {
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
                `;
                collaboratorsList.appendChild(collaboratorItem);
            });
            
        } catch (error) {
            console.error('Error loading collaborators:', error);
        }
    }
}

// ===== FUNCIONES UTILITARIAS =====
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification show';
    
    if (type === 'error') {
        notification.classList.add('error');
    } else if (type === 'warning') {
        notification.classList.add('warning');
    }
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
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
        DocumentService.renderDocumentSelector();
    }
}

function updateAutoSignaturePreview() {
    const autoPreview = document.getElementById('autoSignaturePreview');
    if (!autoPreview || !currentSignature || currentSignature.type !== 'auto') return;
    
    autoPreview.innerHTML = `
        <img src="${currentSignature.data}" alt="Firma automática" 
             style="max-width: 100%; max-height: 100px; background: transparent; border: 1px solid #e1e5e9; border-radius: 4px;">
    `;
}

function updateTimestamp() {
    const now = new Date();
    const updateTime = document.getElementById('updateTime');
    if (updateTime) {
        updateTime.textContent = `Hoy, ${now.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}`;
    }
}

// ===== INICIALIZACIÓN DE LA APLICACIÓN =====
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar autenticación
    AuthService.initAuthListener();

    // Configurar formulario de login
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            showNotification('Por favor, completa todos los campos', 'error');
            return;
        }
        
        try {
            const result = await AuthService.loginUser(email, password);
            
            if (result.success) {
                showNotification(`¡Bienvenido a Cente Docs, ${result.user.name}!`);
            } else {
                showNotification(result.error, 'error');
            }
        } catch (error) {
            showNotification('Error en el inicio de sesión', 'error');
        }
    });
    
    // Configurar botón de registro
    document.getElementById('registerBtn').addEventListener('click', async function() {
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
    
    // Configurar navegación
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.id !== 'logoutBtn') {
            link.addEventListener('click', function() {
                const pageId = this.dataset.page;
                switchPage(pageId);
            });
        }
    });
    
    // Configurar botón de cerrar sesión
    document.getElementById('logoutBtn').addEventListener('click', function() {
        AuthService.logout();
    });
    
    // Configurar selector de documentos
    document.getElementById('documentSelector').addEventListener('change', function(e) {
        if (e.target.value) {
            const file = FileService.files.find(f => f.id === e.target.value);
            if (file) {
                DocumentService.loadDocument(file);
            }
        }
    });
    
    // Configurar botón de subir documento
    document.getElementById('uploadDocumentBtn').addEventListener('click', function() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
        fileInput.multiple = true;
        fileInput.onchange = async (e) => {
            if (e.target.files.length > 0) {
                try {
                    showNotification(`Subiendo ${e.target.files.length} documento(s)...`);
                    await FileService.uploadFiles(e.target.files);
                } catch (error) {
                    console.error('Error al subir documentos:', error);
                    showNotification('Error al subir documentos', 'error');
                }
            }
        };
        fileInput.click();
    });
    
    // Configurar botón de subir archivo
    document.getElementById('uploadFileBtn').addEventListener('click', function() {
        document.getElementById('fileInput').click();
    });
    
    // Configurar subida de archivos
    document.getElementById('fileInput').addEventListener('change', async function(e) {
        if (e.target.files.length > 0) {
            try {
                showNotification(`Subiendo ${e.target.files.length} archivo(s)...`);
                await FileService.uploadFiles(e.target.files);
            } catch (error) {
                console.error('Error al subir archivos:', error);
                showNotification('Error al subir archivos', 'error');
            }
        }
    });
    
    // Configurar búsqueda de archivos
    document.getElementById('fileSearchInput').addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        FileService.filterFiles(searchTerm);
    });
    
    // Configurar pestañas de firma
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
    
    // Configurar botón de usar firma automática
    document.getElementById('useAutoSignature').addEventListener('click', function() {
        if (currentSignature && currentSignature.type === 'auto') {
            DocumentService.setCurrentSignature(currentSignature);
            showNotification('Firma automática seleccionada');
        } else {
            showNotification('No hay firma automática disponible', 'error');
        }
    });
    
    // Configurar carga de firma manual
    const signatureFileInput = document.getElementById('signatureFileInput');
    const uploadSignatureArea = document.getElementById('uploadSignatureArea');
    const saveUploadSignatureBtn = document.getElementById('saveUploadSignature');
    
    if (uploadSignatureArea && signatureFileInput) {
        uploadSignatureArea.addEventListener('click', function() {
            signatureFileInput.click();
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
                    
                    currentSignature = {
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
            if (!currentSignature) {
                showNotification('Por favor, carga una firma digital primero', 'error');
                return;
            }
            
            DocumentService.setCurrentSignature(currentSignature);
            showNotification('Firma guardada correctamente');
        });
    }
    
    // Configurar botón de agregar firma
    document.getElementById('addSignatureBtn').addEventListener('click', function() {
        if (!DocumentService.currentDocument) {
            showNotification('Primero selecciona un documento', 'error');
            return;
        }
        
        if (!currentSignature) {
            showNotification('Primero guarda una firma en el panel lateral', 'error');
            return;
        }
        
        DocumentService.setCurrentSignature(currentSignature);
    });
    
    // Configurar controles de zoom
    document.getElementById('zoomInBtn').addEventListener('click', function() {
        DocumentService.zoomIn();
    });
    
    document.getElementById('zoomOutBtn').addEventListener('click', function() {
        DocumentService.zoomOut();
    });
    
    // Configurar botón de previsualizar
    document.getElementById('previewDocumentBtn').addEventListener('click', function() {
        showNotification('Previsualización en desarrollo', 'info');
    });
    
    // Configurar botón de limpiar firmas
    document.getElementById('clearAllSignatures').addEventListener('click', function() {
        if (DocumentService.documentSignatures.length === 0) {
            showNotification('No hay firmas para eliminar', 'warning');
            return;
        }
        
        if (confirm('¿Estás seguro de que quieres eliminar todas las firmas del documento?')) {
            DocumentService.clearAllSignatures();
        }
    });
    
    // Configurar botón de guardar documento con firmas
    document.getElementById('saveDocumentWithSignatures').addEventListener('click', function() {
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
    
    // Inicializar timestamp
    updateTimestamp();
});