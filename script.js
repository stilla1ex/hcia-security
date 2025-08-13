/**
 * Huawei Mock Exam JavaScript Application
 * This application handles the complete exam flow including:
 * - Question management and navigation
 * - Timer functionality
 * - Answer tracking and validation
 * - Results calculation and display
 * - User interface interactions
 * - Multiple mock exam selection
 * - Page refresh protection
 */

// Application State Management
class ExamApp {
    constructor() {
        // Initialize application state
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.timeRemaining = 5400; // 1.5 hours (90 minutes) in seconds
        this.timerInterval = null;
        this.examStartTime = null;
        this.examEndTime = null;
        this.selectedMock = 1;
        this.examInProgress = false;
        this.mockQuestions = null; // Will hold loaded questions from JSON
        this.shuffledQuestions = null; // Will hold shuffled questions for current exam
        this.questionMapping = []; // Maps shuffled index to original index
        this.answerMapping = []; // Maps shuffled answer options to original indices
        this.currentAttempt = null; // Stores the complete attempt state for review
        this.tabSwitchCount = 0; // Track tab switches for anti-cheating
        this.isTabActive = true; // Track if tab is currently active
        this.uniqueSessionId = this.generateSessionId(); // Unique session identifier
        
        // UI Configuration
        this.feedbackSuccessDisplayTime = 5000; // Duration to show feedback success message (in milliseconds)
        
        // Initialize the application
        this.init();
    }

    /**
     * Initialize the application by setting up event listeners and preparing the UI
     */
    async init() {
        console.log('Initializing Huawei Mock Exam Application...');
        
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        // Verify essential DOM elements exist
        const requiredElements = [
            'home-page', 'question-page', 'results-page', 
            'start-exam-btn', 'question-text', 'answer-options'
        ];
        
        const missingElements = requiredElements.filter(id => !document.getElementById(id));
        if (missingElements.length > 0) {
            console.error('Missing required DOM elements:', missingElements);
            this.showErrorMessage(`Application initialization failed: Missing elements ${missingElements.join(', ')}`);
            return;
        }
        
        // Load questions from JSON file
        await this.loadMockQuestions();
        
        this.setupEventListeners();
        this.setupPageProtection();
        this.disableTextSelection();
        this.setupAntiCheating();
        this.showPage('home-page');
        
                // Setup mobile optimizations
        this.setupMobileOptimizations();
        
        console.log('✅ Huawei Mock Exam Application initialized successfully!');
    }

    /**
     * Load mock questions from JSON file
     */
    async loadMockQuestions() {
        try {
            console.log('Loading mock questions from JSON file...');
            const response = await fetch('mock-questions.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.mockQuestions = data.mockExams;
            
            console.log(`Successfully loaded ${Object.keys(this.mockQuestions).length} mock exams`);
            
            // Update the question count display for the default mock
            this.updateQuestionCount();
            
        } catch (error) {
            console.error('Error loading mock questions:', error);
            
            // Fallback to show error message
            this.showErrorMessage('Failed to load exam questions. Please refresh the page and try again.');
        }
    }

    /**
     * Generate a unique session ID for tracking
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Create attempt state to preserve the exact exam experience for review
     */
    createAttemptState(shuffledQuestions) {
        const attemptId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        this.currentAttempt = {
            attemptId: attemptId,
            timestamp: new Date().toISOString(),
            selectedMock: this.selectedMock,
            questions: shuffledQuestions.map((question, index) => ({
                attemptIndex: index,
                originalIndex: question.originalIndex,
                question: question.question,
                options: [...question.options], // Shuffled options as user saw them
                correctAnswer: question.correctAnswer, // Mapped to shuffled positions
                explanation: question.explanation,
                userAnswer: null, // Will be filled when user answers
                isMultipleChoice: this.isMultipleChoiceQuestion(question)
            })),
            userAnswers: new Array(shuffledQuestions.length).fill(null),
            examStartTime: this.examStartTime,
            examEndTime: null,
            tabSwitchCount: 0
        };
        
        console.log(`Created attempt state ${attemptId} with ${shuffledQuestions.length} questions`);
        
        // Debug: Log attempt state structure
        console.log('Attempt state preview:', {
            attemptId: this.currentAttempt.attemptId,
            questionCount: this.currentAttempt.questions.length,
            firstQuestion: this.currentAttempt.questions[0]?.question?.substring(0, 50) + '...',
            firstQuestionOptions: this.currentAttempt.questions[0]?.options?.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt.substring(0, 30)}...`)
        });
        
        return this.currentAttempt;
    }

    /**
     * Update user answer in the attempt state
     */
    updateAttemptAnswer(questionIndex, userAnswer) {
        if (this.currentAttempt && this.currentAttempt.questions[questionIndex]) {
            this.currentAttempt.questions[questionIndex].userAnswer = userAnswer;
            this.currentAttempt.userAnswers[questionIndex] = userAnswer;
        }
    }

    /**
     * Get questions for the current context (exam or review)
     */
    getCurrentMockQuestions() {
        // If we have a completed attempt (for review), use that
        if (this.currentAttempt && !this.examInProgress) {
            return this.currentAttempt.questions;
        }
        
        // If exam is in progress and we have shuffled questions, return those
        if (this.examInProgress && this.shuffledQuestions) {
            return this.shuffledQuestions;
        }
        
        // Otherwise return original questions for display/counting
        if (!this.mockQuestions) {
            console.warn('Mock questions not loaded yet');
            return [];
        }
        
        const mockData = this.mockQuestions[this.selectedMock];
        return mockData ? mockData.questions : [];
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Shuffle questions and create mappings
     */
    shuffleQuestions(questions) {
        console.log('Shuffling questions and answer options...');
        
        // Create array of indices for shuffling
        const questionIndices = questions.map((_, index) => index);
        const shuffledIndices = this.shuffleArray(questionIndices);
        
        // Create shuffled questions array and mapping
        const shuffledQuestions = [];
        this.questionMapping = [];
        this.answerMapping = [];
        
        shuffledIndices.forEach((originalIndex, shuffledIndex) => {
            const originalQuestion = questions[originalIndex];
            
            // Shuffle answer options for this question
            const optionIndices = originalQuestion.options.map((_, index) => index);
            const shuffledOptionIndices = this.shuffleArray(optionIndices);
            
            // Create shuffled options array
            const shuffledOptions = shuffledOptionIndices.map(originalOptionIndex => 
                originalQuestion.options[originalOptionIndex]
            );
            
            // Map the correct answer(s) to the new shuffled positions
            let shuffledCorrectAnswer;
            if (Array.isArray(originalQuestion.correctAnswer)) {
                // Multiple correct answers
                shuffledCorrectAnswer = originalQuestion.correctAnswer.map(correctIndex => 
                    shuffledOptionIndices.indexOf(correctIndex)
                );
            } else {
                // Single correct answer
                shuffledCorrectAnswer = shuffledOptionIndices.indexOf(originalQuestion.correctAnswer);
            }
            
            // Create the shuffled question
            const shuffledQuestion = {
                ...originalQuestion,
                options: shuffledOptions,
                correctAnswer: shuffledCorrectAnswer,
                originalIndex: originalIndex
            };
            
            shuffledQuestions.push(shuffledQuestion);
            this.questionMapping.push(originalIndex);
            this.answerMapping.push(shuffledOptionIndices);
        });
        
        console.log(`Shuffled ${shuffledQuestions.length} questions with answer options`);
        return shuffledQuestions;
    }

    /**
     * Setup tab switching detection for anti-cheating
     */
    setupAntiCheating() {
        // Track when user switches away from the tab
        document.addEventListener('visibilitychange', () => {
            if (this.examInProgress) {
                if (document.hidden) {
                    this.isTabActive = false;
                    this.tabSwitchCount++;
                    console.warn(`Tab switch detected! Count: ${this.tabSwitchCount}`);
                    
                    // Show warning for first few switches
                    if (this.tabSwitchCount <= 2) {
                        this.showTabSwitchWarning();
                    } else {
                        // Auto-submit exam after multiple tab switches
                        this.showTabSwitchSubmission();
                        setTimeout(() => {
                            this.submitExam();
                        }, 3000);
                    }
                } else {
                    this.isTabActive = true;
                }
            }
        });

        // Also detect focus/blur events
        window.addEventListener('blur', () => {
            if (this.examInProgress && this.isTabActive) {
                this.tabSwitchCount++;
                console.warn(`Window blur detected! Count: ${this.tabSwitchCount}`);
                
                if (this.tabSwitchCount <= 2) {
                    this.showTabSwitchWarning();
                } else {
                    this.showTabSwitchSubmission();
                    setTimeout(() => {
                        this.submitExam();
                    }, 3000);
                }
            }
        });
    }

    /**
     * Show tab switch warning
     */
    showTabSwitchWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'tab-switch-warning';
        warningDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #f56565, #e53e3e);
            color: white;
            padding: 1rem;
            text-align: center;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        warningDiv.innerHTML = `
            ⚠️ WARNING: Tab switching detected! (${this.tabSwitchCount}/3)<br>
            <small>Multiple tab switches will result in automatic exam submission</small>
        `;
        document.body.appendChild(warningDiv);
        
        // Remove warning after 5 seconds
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.parentNode.removeChild(warningDiv);
            }
        }, 5000);
    }

    /**
     * Show tab switch submission notice
     */
    showTabSwitchSubmission() {
        const submissionDiv = document.createElement('div');
        submissionDiv.className = 'tab-switch-submission';
        submissionDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #e53e3e, #c53030);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            text-align: center;
            z-index: 10001;
            font-weight: 600;
            box-shadow: 0 8px 25px rgba(0,0,0,0.5);
            max-width: 400px;
        `;
        submissionDiv.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 1rem;">🚨</div>
            <h3 style="margin: 0 0 1rem 0;">Exam Security Violation</h3>
            <p style="margin: 0 0 1rem 0;">Multiple tab switches detected. Your exam will be automatically submitted for security reasons.</p>
            <div style="background: rgba(255,255,255,0.2); padding: 0.5rem; border-radius: 6px; font-size: 0.9rem;">
                Auto-submitting in 3 seconds...
            </div>
        `;
        document.body.appendChild(submissionDiv);
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 10000;
        `;
        document.body.appendChild(overlay);
        
        // Remove after submission
        setTimeout(() => {
            if (submissionDiv.parentNode) {
                submissionDiv.parentNode.removeChild(submissionDiv);
            }
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 4000);
    }

    /**
     * Show error message to user
     */
    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e53e3e;
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: 500;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        // Remove error message after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    /**
     * Update question count display
     */
    updateQuestionCount() {
        if (this.mockQuestions && this.mockQuestions[this.selectedMock]) {
            const questionCount = document.getElementById('question-count');
            if (questionCount) {
                questionCount.textContent = this.mockQuestions[this.selectedMock].questions.length;
            }
        }
    }

    /**
     * Disable text selection and copy functionality
     */
    disableTextSelection() {
        // Disable right-click context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        // Disable copy shortcuts
        document.addEventListener('keydown', (e) => {
            // Disable Ctrl+C, Ctrl+A, Ctrl+V, Ctrl+S, F12, Ctrl+Shift+I, Ctrl+U
            if ((e.ctrlKey && (e.key === 'c' || e.key === 'a' || e.key === 'v' || e.key === 's' || e.key === 'u')) ||
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                e.preventDefault();
                return false;
            }
        });

        // Disable drag and drop
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });

        // Disable selection with mouse
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });
    }

    /**
     * Setup page refresh and close protection
     */
    setupPageProtection() {
        window.addEventListener('beforeunload', (e) => {
            if (this.examInProgress) {
                const message = 'Are you sure you want to leave? Your exam progress will be lost.';
                e.returnValue = message;
                return message;
            }
        });

        // Also protect against back button during exam
        window.addEventListener('popstate', (e) => {
            if (this.examInProgress) {
                const leave = confirm('Are you sure you want to leave the exam? Your progress will be lost.');
                if (!leave) {
                    window.history.pushState(null, '', window.location.href);
                }
            }
        });
    }

    /**
     * Set up all event listeners for the application
     */
    setupEventListeners() {
        // Home page - Start exam button
        const startExamBtn = document.getElementById('start-exam-btn');
        startExamBtn?.addEventListener('click', () => this.startExam());

        // Mock selection buttons
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('mock-btn')) {
                this.selectMock(event.target);
            }
        });

        // Question page - Next question button
        const nextQuestionBtn = document.getElementById('next-question-btn');
        nextQuestionBtn?.addEventListener('click', () => this.nextQuestion());
        
        // Question page - Previous question button
        const prevQuestionBtn = document.getElementById('prev-question-btn');
        prevQuestionBtn?.addEventListener('click', () => this.prevQuestion());

        // Question page - Submit exam button
        const submitExamBtn = document.getElementById('submit-exam-btn');
        submitExamBtn?.addEventListener('click', () => this.submitExam());

        // Question page - Stop exam button
        const stopExamBtn = document.getElementById('stop-exam-btn');
        stopExamBtn?.addEventListener('click', () => this.stopExam());

        // Stop exam modal buttons
        const continueExamBtn = document.getElementById('continue-exam-btn');
        continueExamBtn?.addEventListener('click', () => this.hideStopExamModal());
        
        const exitExamBtn = document.getElementById('exit-exam-btn');
        exitExamBtn?.addEventListener('click', () => this.confirmExamExit());

        // Close modal when clicking backdrop
        const stopModal = document.getElementById('stop-exam-modal');
        stopModal?.addEventListener('click', (e) => {
            if (e.target === stopModal || e.target.classList.contains('stop-modal-backdrop')) {
                this.hideStopExamModal();
            }
        });

        // Results page - View answers button
        const viewAnswersBtn = document.getElementById('view-answers-btn');
        viewAnswersBtn?.addEventListener('click', () => this.toggleDetailedAnswers());

        // Results page - Retake exam button
        const retakeExamBtn = document.getElementById('retake-exam-btn');
        retakeExamBtn?.addEventListener('click', () => this.retakeExam());

        // Feedback buttons
        const giveFeedbackBtn = document.getElementById('give-feedback-btn');
        giveFeedbackBtn?.addEventListener('click', () => this.showFeedbackModal());
        
        const footerFeedbackBtn = document.getElementById('footer-feedback-btn');
        footerFeedbackBtn?.addEventListener('click', () => this.showFeedbackModal());

        // Report Issue button
        const reportIssueLink = document.getElementById('report-issue-link');
        reportIssueLink?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showIssueReportModal();
        });

        // Issue report modal buttons
        const closeIssueBtn = document.getElementById('close-issue-btn');
        closeIssueBtn?.addEventListener('click', () => this.hideIssueReportModal());
        
        const cancelIssueBtn = document.getElementById('cancel-issue-btn');
        cancelIssueBtn?.addEventListener('click', () => this.hideIssueReportModal());
        
        const submitIssueBtn = document.getElementById('submit-issue-btn');
        submitIssueBtn?.addEventListener('click', () => this.submitIssueReport());

        // Close issue modal when clicking backdrop
        const issueModal = document.getElementById('issue-report-modal');
        issueModal?.addEventListener('click', (e) => {
            if (e.target === issueModal || e.target.classList.contains('issue-modal-backdrop')) {
                this.hideIssueReportModal();
            }
        });

        const closeFeedbackBtn = document.getElementById('close-feedback-btn');
        closeFeedbackBtn?.addEventListener('click', () => this.hideFeedbackModal());

        const cancelFeedbackBtn = document.getElementById('cancel-feedback-btn');
        cancelFeedbackBtn?.addEventListener('click', () => this.hideFeedbackModal());

        const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
        submitFeedbackBtn?.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form submission
            this.submitFeedback();
        });

        // Also handle form submission directly
        const feedbackForm = document.querySelector('.feedback-form');
        feedbackForm?.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent form submission
            this.submitFeedback();
        });

        // Star rating functionality
        this.setupStarRating();

        // Handle answer selection
        document.addEventListener('change', (event) => {
            if (event.target.name === 'answer') {
                this.handleAnswerSelection(event.target.value);
            }
        });

        // Keyboard navigation support
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardNavigation(event);
        });
    }

    /**
     * Select a mock exam
     */
    selectMock(mockBtn) {
        // Remove active class from all mock buttons
        document.querySelectorAll('.mock-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active class to selected button
        mockBtn.classList.add('active');

        // Store selected mock
        this.selectedMock = parseInt(mockBtn.dataset.mock);

        // Update question count display
        this.updateQuestionCount();

        console.log(`Selected Mock ${this.selectedMock}`);
        
        // Log mock details if available
        if (this.mockQuestions && this.mockQuestions[this.selectedMock]) {
            const mockData = this.mockQuestions[this.selectedMock];
            console.log(`Mock Title: ${mockData.title}`);
            console.log(`Question Count: ${mockData.questions.length}`);
        }
    }

    /**
     * Handle keyboard navigation for accessibility
     */
    handleKeyboardNavigation(event) {
        // ESC key to close modals
        if (event.key === 'Escape') {
            const stopModal = document.getElementById('stop-exam-modal');
            const issueModal = document.getElementById('issue-report-modal');
            
            if (stopModal && stopModal.style.display === 'flex') {
                this.hideStopExamModal();
                return;
            }
            
            if (issueModal && issueModal.style.display === 'flex') {
                this.hideIssueReportModal();
                return;
            }
        }
        
        const currentPage = document.querySelector('.page.active');
        
        if (currentPage && currentPage.id === 'question-page') {
            // Number keys 1-4 for answer selection
            if (event.key >= '1' && event.key <= '4') {
                const answerIndex = parseInt(event.key) - 1;
                const radioButtons = document.querySelectorAll('input[name="answer"]');
                if (radioButtons[answerIndex]) {
                    radioButtons[answerIndex].checked = true;
                    this.handleAnswerSelection(radioButtons[answerIndex].value);
                }
            }
            
            // Arrow keys for navigation
            if (event.key === 'ArrowLeft') {
                const prevBtn = document.getElementById('prev-question-btn');
                if (prevBtn && !prevBtn.disabled) {
                    this.prevQuestion();
                }
            }
            
            if (event.key === 'ArrowRight') {
                const nextBtn = document.getElementById('next-question-btn');
                if (nextBtn && !nextBtn.disabled) {
                    this.nextQuestion();
                }
            }
            
            // Enter key for next question
            if (event.key === 'Enter') {
                const nextBtn = document.getElementById('next-question-btn');
                const submitBtn = document.getElementById('submit-exam-btn');
                
                if (nextBtn && !nextBtn.disabled) {
                    this.nextQuestion();
                } else if (submitBtn && submitBtn.style.display !== 'none') {
                    this.submitExam();
                }
            }
        }
    }

    /**
     * Show a specific page and hide others
     */
    showPage(pageId) {
        console.log(`Showing page: ${pageId}`);
        
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Show the requested page
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
    }

    /**
     * Start the exam - initialize timer and show first question
     */
    startExam() {
        console.log('Starting exam...');
        
        // Check if questions are loaded
        if (!this.mockQuestions) {
            this.showErrorMessage('Exam questions are still loading. Please wait a moment and try again.');
            return;
        }
        
        const originalQuestions = this.getCurrentMockQuestions();
        if (originalQuestions.length === 0) {
            this.showErrorMessage('No questions available for the selected mock exam.');
            return;
        }
        
        // Set exam in progress flag
        this.examInProgress = true;
        
        // Reset tab switch counter
        this.tabSwitchCount = 0;
        this.isTabActive = true;
        
        // Show loading screen briefly for better UX
        this.showLoadingScreen();
        
        setTimeout(() => {
            // Shuffle questions and answers for this exam session
            this.shuffledQuestions = this.shuffleQuestions(originalQuestions);
            console.log('Exam prepared with shuffled questions and options');
            
            // Create attempt state to preserve exact exam experience
            this.createAttemptState(this.shuffledQuestions);
            
            // Reset exam state
            this.currentQuestionIndex = 0;
            this.userAnswers = [];
            this.timeRemaining = 5400; // Reset to 1.5 hours
            this.examStartTime = new Date();
            this.currentAttempt.examStartTime = this.examStartTime;
            
            // Initialize user answers array based on shuffled questions
            this.userAnswers = new Array(this.shuffledQuestions.length).fill(null);
            
            // Show question page and start timer
            this.showPage('question-page');
            this.startTimer();
            this.displayQuestion();
            this.hideLoadingScreen();
        }, 1000);
    }

    /**
     * Show loading screen
     */
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
    }

    /**
     * Hide loading screen
     */
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }

    /**
     * Start the exam timer
     */
    startTimer() {
        const timerDisplay = document.getElementById('timer-display');
        
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            
            // Update timer display
            const minutes = Math.floor(this.timeRemaining / 60);
            const seconds = this.timeRemaining % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (timerDisplay) {
                timerDisplay.textContent = timeString;
                
                // Add warning class when time is running low (last 5 minutes)
                if (this.timeRemaining <= 300) {
                    timerDisplay.classList.add('warning');
                }
            }
            
            // End exam when time runs out
            if (this.timeRemaining <= 0) {
                console.log('Time\'s up! Auto-submitting exam...');
                this.submitExam();
            }
        }, 1000);
    }

    /**
     * Stop the exam timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Display the current question and its options
     */
    displayQuestion() {
        const currentQuestions = this.getCurrentMockQuestions();
        
        // Better error checking
        if (!currentQuestions || currentQuestions.length === 0) {
            console.error('No questions available for current mock');
            return;
        }
        
        if (this.currentQuestionIndex >= currentQuestions.length) {
            console.error(`Question index ${this.currentQuestionIndex} is out of bounds (total: ${currentQuestions.length})`);
            return;
        }
        
        const question = currentQuestions[this.currentQuestionIndex];
        
        // Validate question object
        if (!question) {
            console.error(`Question at index ${this.currentQuestionIndex} is null or undefined`);
            return;
        }
        
        if (!question.question || !question.options) {
            console.error(`Question at index ${this.currentQuestionIndex} is missing required fields:`, question);
            return;
        }
        
        const questionText = document.getElementById('question-text');
        const answerOptions = document.getElementById('answer-options');
        const questionCounter = document.getElementById('question-counter');
        const progressFill = document.getElementById('progress-fill');
        
        console.log(`Displaying question ${this.currentQuestionIndex + 1}: ${question.question}`);
        console.log(`Question has ${question.options.length} options:`, question.options);
        
        // Update question text
        if (questionText) {
            const isMultipleChoice = this.isMultipleChoiceQuestion(question);
            const questionPrefix = isMultipleChoice ? 
                '<span class="question-type multiple-choice">Multiple Choice</span>' : 
                '<span class="question-type single-choice">Single Choice</span>';
            questionText.innerHTML = questionPrefix + question.question;
        }
        
        // Update progress indicator
        if (questionCounter) {
            questionCounter.textContent = `Question ${this.currentQuestionIndex + 1} of ${currentQuestions.length}`;
        }
        
        // Update progress bar
        if (progressFill) {
            const progress = ((this.currentQuestionIndex + 1) / currentQuestions.length) * 100;
            progressFill.style.width = `${progress}%`;
        }
        
        // Generate answer options
        if (answerOptions) {
            answerOptions.innerHTML = '';
            
            if (question.options && Array.isArray(question.options) && question.options.length > 0) {
                // Check if this is a multiple choice question
                const isMultipleChoice = this.isMultipleChoiceQuestion(question);
                
                question.options.forEach((option, index) => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'answer-option';
                    
                    const inputElement = document.createElement('input');
                    inputElement.type = isMultipleChoice ? 'checkbox' : 'radio';
                    inputElement.name = isMultipleChoice ? `answer-${index}` : 'answer';
                    inputElement.value = index;
                    inputElement.id = `option-${index}`;
                    
                    // Check if this option was previously selected
                    if (isMultipleChoice) {
                        const userAnswer = this.userAnswers[this.currentQuestionIndex];
                        if (Array.isArray(userAnswer) && userAnswer.includes(index)) {
                            inputElement.checked = true;
                            optionDiv.classList.add('selected');
                        }
                    } else {
                        if (this.userAnswers[this.currentQuestionIndex] === index) {
                            inputElement.checked = true;
                            optionDiv.classList.add('selected');
                        }
                    }
                    
                    const label = document.createElement('label');
                    label.htmlFor = `option-${index}`;
                    label.textContent = option;
                    
                    optionDiv.appendChild(inputElement);
                    optionDiv.appendChild(label);
                    
                    // Add click handler for the entire option div
                    optionDiv.addEventListener('click', (e) => {
                        // Prevent double triggering when clicking the input directly
                        if (e.target !== inputElement) {
                            inputElement.checked = !inputElement.checked;
                        }
                        this.handleAnswerSelection(index, isMultipleChoice);
                    });
                    
                    // Add change handler for the input element
                    inputElement.addEventListener('change', () => {
                        this.handleAnswerSelection(index, isMultipleChoice);
                    });
                    
                    answerOptions.appendChild(optionDiv);
                });
                
                console.log(`Successfully created ${question.options.length} ${isMultipleChoice ? 'multiple choice' : 'single choice'} answer options`);
            } else {
                console.error('Question options are invalid:', question.options);
                answerOptions.innerHTML = '<div class="error-message">Error: No answer options available for this question.</div>';
            }
        } else {
            console.error('answerOptions element not found in DOM');
        }
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }

    /**
     * Check if a question is multiple choice based on question text patterns
     */
    isMultipleChoiceQuestion(question) {
        if (!question || !question.question) {
            return false;
        }
        
        const questionText = question.question.toLowerCase();
        
        // Check for explicit multiple choice indicators
        const multipleChoicePatterns = [
            /select.*\d+.*answers?/,
            /multiple.*choice/,
            /\(select.*answers?\)/,
            /which.*of.*the.*following.*are.*correct/,
            /which.*of.*the.*following.*statements.*are.*correct/,
            /which.*of.*the.*following.*are.*true/,
            /which.*of.*the.*following.*are.*false/,
            /which.*of.*the.*following.*are.*components?/,
            /which.*of.*the.*following.*are.*characteristics/,
            /which.*of.*the.*following.*are.*filtering/,
            /which.*of.*the.*following.*algorithms.*are/,
            /which.*of.*the.*following.*ports.*are/,
            /which.*of.*the.*following.*modes.*are/,
            /which.*of.*the.*following.*technologies.*are/,
            /which.*of.*the.*following.*protocols.*are/,
            /which.*of.*the.*following.*vpns.*are/,
            /which.*of.*the.*following.*authentication.*modes.*are/,
            /which.*of.*the.*following.*backup.*modes.*are/,
            /which.*of.*the.*following.*statements.*are/
        ];
        
        // Check if question matches any multiple choice pattern
        for (const pattern of multipleChoicePatterns) {
            if (pattern.test(questionText)) {
                return true;
            }
        }
        
        // Also check if correctAnswer is an array (indicates multiple correct answers)
        if (Array.isArray(question.correctAnswer)) {
            return true;
        }
        
        return false;
    }

    /**
     * Handle answer selection
     */
    handleAnswerSelection(answerIndex, isMultipleChoice = false) {
        console.log(`Answer selected: ${answerIndex} for question ${this.currentQuestionIndex + 1} (Multiple choice: ${isMultipleChoice})`);
        
        if (isMultipleChoice) {
            // Handle multiple choice selection
            let currentAnswers = this.userAnswers[this.currentQuestionIndex];
            if (!Array.isArray(currentAnswers)) {
                currentAnswers = [];
            }
            
            const indexPosition = currentAnswers.indexOf(answerIndex);
            if (indexPosition === -1) {
                // Add the answer if not already selected
                currentAnswers.push(answerIndex);
            } else {
                // Remove the answer if already selected
                currentAnswers.splice(indexPosition, 1);
            }
            
            this.userAnswers[this.currentQuestionIndex] = currentAnswers;
            
            // Update attempt state
            this.updateAttemptAnswer(this.currentQuestionIndex, currentAnswers);
            
            // Update UI to show selection
            document.querySelectorAll('.answer-option').forEach((option, index) => {
                const isSelected = currentAnswers.includes(index);
                option.classList.toggle('selected', isSelected);
                const input = option.querySelector('input');
                if (input) {
                    input.checked = isSelected;
                }
            });
            
        } else {
            // Handle single choice selection
            this.userAnswers[this.currentQuestionIndex] = parseInt(answerIndex);
            
            // Update attempt state
            this.updateAttemptAnswer(this.currentQuestionIndex, parseInt(answerIndex));
            
            // Update UI to show selection
            document.querySelectorAll('.answer-option').forEach((option, index) => {
                option.classList.toggle('selected', index === parseInt(answerIndex));
            });
        }
        
        // Enable next button if at least one answer is selected
        const nextBtn = document.getElementById('next-question-btn');
        const submitBtn = document.getElementById('submit-exam-btn');
        
        const hasAnswer = isMultipleChoice ? 
            (Array.isArray(this.userAnswers[this.currentQuestionIndex]) && this.userAnswers[this.currentQuestionIndex].length > 0) :
            (this.userAnswers[this.currentQuestionIndex] !== undefined);
            
        if (nextBtn) nextBtn.disabled = !hasAnswer;
        if (submitBtn && submitBtn.style.display !== 'none') submitBtn.disabled = !hasAnswer;
    }

    /**
     * Update navigation buttons based on current question
     */
    updateNavigationButtons() {
        const nextBtn = document.getElementById('next-question-btn');
        const prevBtn = document.getElementById('prev-question-btn');
        const submitBtn = document.getElementById('submit-exam-btn');
        
        const currentQuestions = this.getCurrentMockQuestions();
        const isLastQuestion = this.currentQuestionIndex === currentQuestions.length - 1;
        const isFirstQuestion = this.currentQuestionIndex === 0;
        const hasAnswer = this.userAnswers[this.currentQuestionIndex] !== null;
        
        // Previous button logic
        if (prevBtn) {
            prevBtn.disabled = isFirstQuestion;
        }
        
        // Next/Submit button logic
        if (nextBtn && submitBtn) {
            if (isLastQuestion) {
                nextBtn.style.display = 'none';
                submitBtn.style.display = 'inline-block';
                submitBtn.disabled = !hasAnswer;
            } else {
                nextBtn.style.display = 'inline-block';
                submitBtn.style.display = 'none';
                nextBtn.disabled = !hasAnswer;
            }
        }
    }

    /**
     * Move to the next question
     */
    nextQuestion() {
        const currentQuestions = this.getCurrentMockQuestions();
        if (this.currentQuestionIndex < currentQuestions.length - 1) {
            this.currentQuestionIndex++;
            this.displayQuestion();
            
            // Scroll to top of question
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * Move to the previous question
     */
    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.displayQuestion();
            
            // Scroll to top of question
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * Submit the exam and show results
     */
    submitExam() {
        console.log('Submitting exam...');
        
        // Set exam no longer in progress
        this.examInProgress = false;
        
        // Stop the timer
        this.stopTimer();
        this.examEndTime = new Date();
        
        // Finalize attempt state
        if (this.currentAttempt) {
            this.currentAttempt.examEndTime = this.examEndTime;
            this.currentAttempt.tabSwitchCount = this.tabSwitchCount;
            // Store attempt in localStorage for persistence
            try {
                localStorage.setItem(`hcia-attempt-${this.currentAttempt.attemptId}`, JSON.stringify(this.currentAttempt));
                console.log(`Attempt state saved: ${this.currentAttempt.attemptId}`);
            } catch (error) {
                console.warn('Failed to save attempt state:', error);
            }
        }
        
        // Show loading screen
        this.showLoadingScreen();
        
        setTimeout(() => {
            // Calculate and display results
            this.calculateResults();
            this.showPage('results-page');
            this.hideLoadingScreen();
            
            // Scroll to top of results
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 1500);
    }

    /**
     * Stop the exam early and show results for answered questions
     */
    stopExam() {
        console.log('Showing stop exam modal...');
        
        // Show the stop exam modal instead of confirm dialog
        this.showStopExamModal();
    }

    /**
     * Show the stop exam modal
     */
    showStopExamModal() {
        const modal = document.getElementById('stop-exam-modal');
        if (modal) {
            modal.style.display = 'flex';
            // Add show class with slight delay for smooth animation
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
        }
    }

    /**
     * Hide the stop exam modal
     */
    hideStopExamModal() {
        const modal = document.getElementById('stop-exam-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    }

    /**
     * Handle exam exit confirmation
     */
    confirmExamExit() {
        console.log('Stopping exam early...');
        
        // Hide the modal first
        this.hideStopExamModal();
        
        // Set exam no longer in progress
        this.examInProgress = false;
        
        // Stop the timer
        this.stopTimer();
        this.examEndTime = new Date();
        
        // Finalize attempt state
        if (this.currentAttempt) {
            this.currentAttempt.examEndTime = this.examEndTime;
            this.currentAttempt.tabSwitchCount = this.tabSwitchCount;
            // Store attempt in localStorage for persistence
            try {
                localStorage.setItem(`hcia-attempt-${this.currentAttempt.attemptId}`, JSON.stringify(this.currentAttempt));
                console.log(`Attempt state saved (early exit): ${this.currentAttempt.attemptId}`);
            } catch (error) {
                console.warn('Failed to save attempt state:', error);
            }
        }
        
        // Show loading screen
        this.showLoadingScreen();
        
        setTimeout(() => {
            // Calculate and display results
            this.calculateResults();
            this.showPage('results-page');
            this.hideLoadingScreen();
            
            // Scroll to top of results
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 1000);
    }

    /**
     * Calculate exam results and update the results page with strict validation
     */
    calculateResults() {
        console.log('Calculating results with strict validation...');
        
        const currentQuestions = this.getCurrentMockQuestions();
        let correctAnswers = 0;
        let incorrectAnswers = 0;
        let unansweredQuestions = 0;
        let partiallyCorrectAnswers = 0; // Track partially correct for reporting
        
        // Count correct, incorrect, and unanswered questions
        currentQuestions.forEach((question, index) => {
            const userAnswer = this.userAnswers[index];
            const isMultipleChoice = this.isMultipleChoiceQuestion(question);
            
            if (userAnswer === null || userAnswer === undefined || 
                (Array.isArray(userAnswer) && userAnswer.length === 0)) {
                unansweredQuestions++;
                return;
            }
            
            let isCorrect = false;
            
            if (isMultipleChoice) {
                // Strict validation for multiple choice questions
                const correctAnswerArray = Array.isArray(question.correctAnswer) ? 
                    question.correctAnswer : [question.correctAnswer];
                
                if (Array.isArray(userAnswer)) {
                    // STRICT: All correct answers must be selected, no incorrect answers allowed
                    const sortedCorrect = [...correctAnswerArray].sort((a, b) => a - b);
                    const sortedUser = [...userAnswer].sort((a, b) => a - b);
                    
                    // Check if arrays are exactly equal
                    isCorrect = sortedCorrect.length === sortedUser.length &&
                               sortedCorrect.every((ans, i) => ans === sortedUser[i]);
                    
                    // For debugging and feedback: check if partially correct
                    if (!isCorrect) {
                        const hasCorrectAnswers = correctAnswerArray.some(ans => userAnswer.includes(ans));
                        const hasIncorrectAnswers = userAnswer.some(ans => !correctAnswerArray.includes(ans));
                        const missingCorrectAnswers = correctAnswerArray.some(ans => !userAnswer.includes(ans));
                        
                        if (hasCorrectAnswers && (hasIncorrectAnswers || missingCorrectAnswers)) {
                            partiallyCorrectAnswers++;
                        }
                    }
                } else {
                    // User provided single answer but question requires multiple
                    isCorrect = false;
                    if (correctAnswerArray.includes(userAnswer)) {
                        partiallyCorrectAnswers++;
                    }
                }
            } else {
                // Single choice validation
                if (Array.isArray(question.correctAnswer)) {
                    // Question has multiple correct answers but user can only select one
                    isCorrect = question.correctAnswer.includes(userAnswer);
                } else {
                    // Standard single choice
                    isCorrect = userAnswer === question.correctAnswer;
                }
            }
            
            if (isCorrect) {
                correctAnswers++;
            } else {
                incorrectAnswers++;
            }
        });
        
        const totalQuestions = currentQuestions.length;
        const answeredQuestions = correctAnswers + incorrectAnswers;
        const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
        
        console.log(`Results (Strict Validation): ${correctAnswers}/${totalQuestions} correct (${percentage}%)`);
        console.log(`Answered: ${answeredQuestions}/${totalQuestions}, Unanswered: ${unansweredQuestions}`);
        console.log(`Partially Correct (but marked wrong): ${partiallyCorrectAnswers}`);
        
        // Update results display
        this.updateResultsDisplay(correctAnswers, incorrectAnswers, totalQuestions, percentage, unansweredQuestions);
        
        // Generate detailed answers with enhanced information
        this.generateDetailedAnswers();
    }

    /**
     * Update the results display with calculated scores
     */
    updateResultsDisplay(correct, incorrect, total, percentage, unanswered = 0) {
        // Update score elements
        const scorePercentage = document.getElementById('score-percentage');
        const correctAnswersEl = document.getElementById('correct-answers');
        const incorrectAnswersEl = document.getElementById('incorrect-answers');
        const totalQuestionsEl = document.getElementById('total-questions');
        const timeTakenEl = document.getElementById('time-taken');
        const feedbackMessage = document.getElementById('feedback-message');
        
        if (scorePercentage) scorePercentage.textContent = `${percentage}%`;
        if (correctAnswersEl) correctAnswersEl.textContent = correct;
        if (incorrectAnswersEl) incorrectAnswersEl.textContent = incorrect;
        if (totalQuestionsEl) totalQuestionsEl.textContent = total;
        
        // Calculate and display exam duration
        if (timeTakenEl && this.examStartTime && this.examEndTime) {
            const durationMs = this.examEndTime - this.examStartTime;
            const durationMinutes = Math.floor(durationMs / 60000);
            const durationSeconds = Math.floor((durationMs % 60000) / 1000);
            const formattedTime = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
            timeTakenEl.textContent = formattedTime;
        } else if (timeTakenEl) {
            timeTakenEl.textContent = '--:--';
        }
        
        // Generate feedback message
        let feedbackHTML = '';
        let feedbackClass = '';
        
        // Add note about unanswered questions if any
        const unansweredNote = unanswered > 0 ? ` Note: ${unanswered} questions were not answered.` : '';
        
        if (percentage >= 90) {
            feedbackClass = 'feedback-excellent';
            feedbackHTML = `
                <h3>🎉 Excellent Work!</h3>
                <p>Outstanding performance! You've demonstrated excellent knowledge of Huawei security concepts. You're well-prepared for the actual certification exam.${unansweredNote}</p>
            `;
        } else if (percentage >= 80) {
            feedbackClass = 'feedback-good';
            feedbackHTML = `
                <h3>👍 Great Job!</h3>
                <p>Very good performance! You have a solid understanding of Huawei security concepts. Review the questions you missed and you'll be ready for certification.${unansweredNote}</p>
            `;
        } else if (percentage >= 70) {
            feedbackClass = 'feedback-good';
            feedbackHTML = `
                <h3>✅ Good Progress!</h3>
                <p>You're on the right track! You've reached the passing threshold, but there's room for improvement. Focus on the areas where you missed questions.${unansweredNote}</p>
            `;
        } else if (percentage >= 50) {
            feedbackClass = 'feedback-needs-improvement';
            feedbackHTML = `
                <h3>📚 Keep Studying!</h3>
                <p>You're making progress, but need more preparation. Review the study materials and focus on understanding the fundamental concepts. Practice more mock exams.${unansweredNote}</p>
            `;
        } else {
            feedbackClass = 'feedback-poor';
            feedbackHTML = `
                <h3>💪 Don't Give Up!</h3>
                <p>This is a learning opportunity! Review the study materials thoroughly and take time to understand each concept. Consider additional training resources before retaking.${unansweredNote}</p>
            `;
        }
        
        if (feedbackMessage) {
            feedbackMessage.className = `feedback-message ${feedbackClass}`;
            feedbackMessage.innerHTML = feedbackHTML;
        }
        
        // Animate score circle
        this.animateScoreCircle(percentage);
    }

    /**
     * Animate the score circle for visual effect
     */
    animateScoreCircle(percentage) {
        const scoreCircle = document.querySelector('.score-circle');
        if (scoreCircle) {
            // Set gradient color based on score
            let gradientColor;
            if (percentage >= 80) {
                gradientColor = 'linear-gradient(135deg, #48bb78, #38a169)'; // Green
            } else if (percentage >= 70) {
                gradientColor = 'linear-gradient(135deg, #4299e1, #3182ce)'; // Blue
            } else if (percentage >= 50) {
                gradientColor = 'linear-gradient(135deg, #ed8936, #dd6b20)'; // Orange
            } else {
                gradientColor = 'linear-gradient(135deg, #e53e3e, #c53030)'; // Red
            }
            
            scoreCircle.style.background = gradientColor;
        }
    }

    /**
     * Generate enhanced detailed answers for comprehensive review
     */
    generateDetailedAnswers() {
        const answerReviewList = document.getElementById('answer-review-list');
        if (!answerReviewList) return;
        
        const currentQuestions = this.getCurrentMockQuestions();
        answerReviewList.innerHTML = '';
        
        // Add navigation and summary header
        const summaryHeader = document.createElement('div');
        summaryHeader.className = 'review-summary';
        summaryHeader.innerHTML = `
            <div class="review-navigation">
                <h3>📋 Comprehensive Question Review</h3>
                <div class="review-stats">
                    <span class="stat correct-stat">✅ Correct: ${this.userAnswers.filter((answer, i) => this.isAnswerCorrect(answer, currentQuestions[i])).length}</span>
                    <span class="stat incorrect-stat">❌ Incorrect: ${this.userAnswers.filter((answer, i) => answer !== null && !this.isAnswerCorrect(answer, currentQuestions[i])).length}</span>
                    <span class="stat unanswered-stat">❓ Unanswered: ${this.userAnswers.filter(answer => answer === null || (Array.isArray(answer) && answer.length === 0)).length}</span>
                </div>
                <div class="review-filters">
                    <button class="filter-btn active" data-filter="all">All Questions</button>
                    <button class="filter-btn" data-filter="incorrect">Incorrect Only</button>
                    <button class="filter-btn" data-filter="correct">Correct Only</button>
                    <button class="filter-btn" data-filter="unanswered">Unanswered Only</button>
                </div>
            </div>
        `;
        answerReviewList.appendChild(summaryHeader);
        
        // Add filter functionality
        summaryHeader.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active button
                summaryHeader.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Filter questions
                const filter = e.target.dataset.filter;
                this.filterReviewQuestions(filter);
            });
        });
        
        currentQuestions.forEach((question, index) => {
            const reviewItem = document.createElement('div');
            reviewItem.className = 'answer-review-item';
            reviewItem.dataset.questionIndex = index;
            
            const userAnswer = this.userAnswers[index];
            const correctAnswer = question.correctAnswer;
            const isMultipleChoice = this.isMultipleChoiceQuestion(question);
            const isCorrect = this.isAnswerCorrect(userAnswer, question);
            const isUnanswered = userAnswer === null || userAnswer === undefined || 
                                (Array.isArray(userAnswer) && userAnswer.length === 0);
            
            // Set data attributes for filtering
            reviewItem.dataset.status = isUnanswered ? 'unanswered' : (isCorrect ? 'correct' : 'incorrect');
            
            // Build question type indicator
            let questionTypeInfo = '';
            if (isMultipleChoice) {
                const correctCount = Array.isArray(correctAnswer) ? correctAnswer.length : 1;
                questionTypeInfo = `<span class="question-type-badge multiple">Multiple Choice (${correctCount} correct)</span>`;
            } else {
                questionTypeInfo = `<span class="question-type-badge single">Single Choice</span>`;
            }
            
            // Build user selection summary
            let userSelectionSummary = '';
            if (isUnanswered) {
                userSelectionSummary = '<div class="user-selection-summary unanswered">📝 <strong>Your Answer:</strong> Not answered</div>';
            } else {
                let selectedOptions = [];
                if (isMultipleChoice && Array.isArray(userAnswer)) {
                    selectedOptions = userAnswer.map(i => `${String.fromCharCode(65 + i)}. ${question.options[i]}`);
                    userSelectionSummary = `<div class="user-selection-summary ${isCorrect ? 'correct' : 'incorrect'}">📝 <strong>Your Answer(s):</strong> ${selectedOptions.join(', ')}</div>`;
                } else {
                    const selectedLabel = String.fromCharCode(65 + userAnswer);
                    userSelectionSummary = `<div class="user-selection-summary ${isCorrect ? 'correct' : 'incorrect'}">📝 <strong>Your Answer:</strong> ${selectedLabel}. ${question.options[userAnswer]}</div>`;
                }
            }

            let reviewHTML = `
                <div class="review-question-header">
                    <div class="question-number">Question ${index + 1}</div>
                    ${questionTypeInfo}
                    <div class="question-difficulty">
                        ${this.getQuestionDifficulty(question)}
                    </div>
                </div>
                <div class="review-question">
                    <strong>${question.question}</strong>
                </div>
                ${userSelectionSummary}
                <div class="review-answers">
            `;
            
            question.options.forEach((option, optionIndex) => {
                let answerClass = 'not-selected';
                let prefix = '';
                let explanation = '';
                let optionLabel = String.fromCharCode(65 + optionIndex); // A, B, C, D...
                
                const isCorrectOption = isMultipleChoice ? 
                    (Array.isArray(correctAnswer) ? correctAnswer.includes(optionIndex) : correctAnswer === optionIndex) :
                    (optionIndex === correctAnswer);
                
                const isUserSelected = isMultipleChoice ?
                    (Array.isArray(userAnswer) && userAnswer.includes(optionIndex)) :
                    (optionIndex === userAnswer);
                
                if (isCorrectOption && isUserSelected) {
                    answerClass = 'correct-selected';
                    prefix = `✅ ${optionLabel}. `;
                    explanation = '<small class="answer-explanation">✓ You selected this - CORRECT!</small>';
                } else if (isCorrectOption && !isUserSelected) {
                    answerClass = 'correct-not-selected';
                    prefix = `✓ ${optionLabel}. `;
                    explanation = '<small class="answer-explanation">Correct answer (you did not select this)</small>';
                } else if (!isCorrectOption && isUserSelected) {
                    answerClass = 'incorrect-selected';
                    prefix = `❌ ${optionLabel}. `;
                    explanation = '<small class="answer-explanation">✗ You selected this - INCORRECT</small>';
                } else {
                    answerClass = 'not-selected';
                    prefix = `${optionLabel}. `;
                }
                
                if (isUnanswered && isCorrectOption) {
                    answerClass = 'correct-not-answered';
                    prefix = `✓ ${optionLabel}. `;
                    explanation = '<small class="answer-explanation">Correct answer (not answered)</small>';
                }
                
                reviewHTML += `
                    <div class="review-answer ${answerClass}">
                        <div class="answer-content">
                            ${prefix}${option}
                        </div>
                        ${explanation}
                    </div>
                `;
            });
            
            // Add comprehensive status and feedback
            let statusHTML = '';
            let feedbackHTML = '';
            
            if (isUnanswered) {
                statusHTML = '<div class="review-status unanswered">❓ Not Answered</div>';
                feedbackHTML = '<div class="review-feedback unanswered">You did not answer this question. Review the explanation below to understand the correct answer.</div>';
            } else if (isCorrect) {
                statusHTML = '<div class="review-status correct">✅ Correct</div>';
                feedbackHTML = '<div class="review-feedback correct">Excellent! You selected the correct answer(s).</div>';
            } else {
                statusHTML = '<div class="review-status incorrect">❌ Incorrect</div>';
                if (isMultipleChoice) {
                    const correctAnswerArray = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
                    const userAnswerArray = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
                    const missingAnswers = correctAnswerArray.filter(ans => !userAnswerArray.includes(ans));
                    const extraAnswers = userAnswerArray.filter(ans => !correctAnswerArray.includes(ans));
                    
                    let details = [];
                    if (missingAnswers.length > 0) {
                        const missingLabels = missingAnswers.map(i => `${String.fromCharCode(65 + i)}. ${question.options[i]}`);
                        details.push(`Missing correct answer(s): ${missingLabels.join(', ')}`);
                    }
                    if (extraAnswers.length > 0) {
                        const extraLabels = extraAnswers.map(i => `${String.fromCharCode(65 + i)}. ${question.options[i]}`);
                        details.push(`Incorrectly selected: ${extraLabels.join(', ')}`);
                    }
                    
                    feedbackHTML = `<div class="review-feedback incorrect">For multiple choice questions, you must select ALL correct answers and NO incorrect answers. ${details.join('. ')}</div>`;
                } else {
                    const userLabel = String.fromCharCode(65 + userAnswer);
                    const correctLabel = String.fromCharCode(65 + correctAnswer);
                    feedbackHTML = `<div class="review-feedback incorrect">You selected "${userLabel}. ${question.options[userAnswer]}" but the correct answer is "${correctLabel}. ${question.options[correctAnswer]}".</div>`;
                }
            }
            
            reviewHTML += statusHTML + feedbackHTML;
            
            // Add explanation if available
            if (question.explanation) {
                reviewHTML += `
                    <div class="review-explanation">
                        <div class="explanation-header">
                            <strong>📚 Explanation & Reference:</strong>
                        </div>
                        <div class="explanation-content">
                            ${question.explanation}
                        </div>
                    </div>
                `;
            }
            
            // Add study recommendations
            if (!isCorrect || isUnanswered) {
                reviewHTML += `
                    <div class="study-recommendations">
                        <div class="recommendation-header">
                            <strong>📖 Study Recommendations:</strong>
                        </div>
                        <div class="recommendation-content">
                            ${this.getStudyRecommendations(question)}
                        </div>
                    </div>
                `;
            }
            
            reviewHTML += '</div>';
            reviewItem.innerHTML = reviewHTML;
            answerReviewList.appendChild(reviewItem);
        });
    }

    /**
     * Check if a user's answer is correct using strict validation
     */
    isAnswerCorrect(userAnswer, question) {
        const isMultipleChoice = this.isMultipleChoiceQuestion(question);
        
        if (userAnswer === null || userAnswer === undefined || 
            (Array.isArray(userAnswer) && userAnswer.length === 0)) {
            return false;
        }
        
        if (isMultipleChoice) {
            const correctAnswerArray = Array.isArray(question.correctAnswer) ? 
                question.correctAnswer : [question.correctAnswer];
            
            if (Array.isArray(userAnswer)) {
                const sortedCorrect = [...correctAnswerArray].sort((a, b) => a - b);
                const sortedUser = [...userAnswer].sort((a, b) => a - b);
                
                return sortedCorrect.length === sortedUser.length &&
                       sortedCorrect.every((ans, i) => ans === sortedUser[i]);
            }
            return false;
        } else {
            return userAnswer === question.correctAnswer;
        }
    }

    /**
     * Filter review questions based on status
     */
    filterReviewQuestions(filter) {
        const reviewItems = document.querySelectorAll('.answer-review-item[data-question-index]');
        
        reviewItems.forEach(item => {
            const status = item.dataset.status;
            let show = false;
            
            switch (filter) {
                case 'all':
                    show = true;
                    break;
                case 'correct':
                    show = status === 'correct';
                    break;
                case 'incorrect':
                    show = status === 'incorrect';
                    break;
                case 'unanswered':
                    show = status === 'unanswered';
                    break;
            }
            
            item.style.display = show ? 'block' : 'none';
        });
    }

    /**
     * Get question difficulty based on content
     */
    getQuestionDifficulty(question) {
        const text = question.question.toLowerCase();
        
        // Advanced concepts
        if (text.includes('ipsec') || text.includes('pki') || text.includes('certificate') || 
            text.includes('encryption') || text.includes('vpn') || text.includes('radius')) {
            return '<span class="difficulty-badge advanced">🔴 Advanced</span>';
        }
        
        // Intermediate concepts
        if (text.includes('firewall') || text.includes('nat') || text.includes('session') || 
            text.includes('protocol') || text.includes('authentication')) {
            return '<span class="difficulty-badge intermediate">🟡 Intermediate</span>';
        }
        
        // Basic concepts
        return '<span class="difficulty-badge basic">🟢 Basic</span>';
    }

    /**
     * Get study recommendations based on question content
     */
    getStudyRecommendations(question) {
        const text = question.question.toLowerCase();
        
        if (text.includes('firewall')) {
            return 'Review firewall fundamentals, packet filtering, and stateful inspection concepts.';
        } else if (text.includes('vpn') || text.includes('ipsec')) {
            return 'Study VPN technologies, IPSec protocols, and tunnel establishment procedures.';
        } else if (text.includes('encryption') || text.includes('cryptography')) {
            return 'Focus on cryptographic algorithms, key management, and encryption standards.';
        } else if (text.includes('authentication') || text.includes('radius')) {
            return 'Review AAA concepts, authentication protocols, and user management systems.';
        } else if (text.includes('network') || text.includes('tcp') || text.includes('ip')) {
            return 'Study network fundamentals, TCP/IP protocol stack, and network communications.';
        } else if (text.includes('attack') || text.includes('malware') || text.includes('security')) {
            return 'Review common attack vectors, security threats, and defensive strategies.';
        } else {
            return 'Review the relevant chapter in your Huawei Security certification study materials.';
        }
    }

    /**
     * Toggle detailed answers visibility
     */
    toggleDetailedAnswers() {
        const detailedAnswers = document.getElementById('detailed-answers');
        const viewAnswersBtn = document.getElementById('view-answers-btn');
        
        if (detailedAnswers && viewAnswersBtn) {
            const isVisible = detailedAnswers.style.display !== 'none';
            
            if (isVisible) {
                detailedAnswers.style.display = 'none';
                viewAnswersBtn.textContent = 'View Detailed Answers';
            } else {
                detailedAnswers.style.display = 'block';
                viewAnswersBtn.textContent = 'Hide Detailed Answers';
                
                // Scroll to detailed answers
                detailedAnswers.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }

    /**
     * Retake the exam - reset everything and start over
     */
    retakeExam() {
        console.log('Retaking exam...');
        
        // Reset all state
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.timeRemaining = 5400;
        this.examStartTime = null;
        this.examEndTime = null;
        this.examInProgress = false;
        this.shuffledQuestions = null;
        this.currentAttempt = null; // Clear attempt state for new exam
        
        // Stop any running timer
        this.stopTimer();
        
        // Hide detailed answers
        const detailedAnswers = document.getElementById('detailed-answers');
        if (detailedAnswers) {
            detailedAnswers.style.display = 'none';
        }
        
        // Reset view answers button
        const viewAnswersBtn = document.getElementById('view-answers-btn');
        if (viewAnswersBtn) {
            viewAnswersBtn.textContent = 'View Detailed Answers';
        }
        
        // Go back to home page
        this.showPage('home-page');
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * Setup star rating functionality
     */
    setupStarRating() {
        const stars = document.querySelectorAll('.star');
        const radioInputs = document.querySelectorAll('.star-rating input[type="radio"]');
        let currentRating = 0;

        stars.forEach((star, index) => {
            star.addEventListener('click', () => {
                const radioValue = parseInt(radioInputs[index].value);
                currentRating = radioValue;
                
                // Update the corresponding radio button
                radioInputs[index].checked = true;
                
                this.updateStarDisplay(currentRating);
            });

            star.addEventListener('mouseenter', () => {
                const radioValue = parseInt(radioInputs[index].value);
                this.updateStarDisplay(radioValue);
            });
        });

        const starContainer = document.querySelector('.star-rating');
        if (starContainer) {
            starContainer.addEventListener('mouseleave', () => {
                this.updateStarDisplay(currentRating);
            });
        }
    }

    /**
     * Update star display
     */
    updateStarDisplay(rating) {
        const stars = document.querySelectorAll('.star');
        const radioInputs = document.querySelectorAll('.star-rating input[type="radio"]');
        
        stars.forEach((star, index) => {
            const radioValue = parseInt(radioInputs[index].value);
            if (radioValue <= rating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }

    /**
     * Show feedback modal
     */
    showFeedbackModal() {
        const modal = document.getElementById('feedback-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // Reset form
            this.resetFeedbackForm();
        }
    }

    /**
     * Hide feedback modal
     */
    hideFeedbackModal() {
        const modal = document.getElementById('feedback-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    /**
     * Reset feedback form
     */
    resetFeedbackForm() {
        const feedbackType = document.getElementById('feedback-type');
        const feedbackMessage = document.getElementById('feedback-message-text');
        const feedbackEmail = document.getElementById('feedback-email');
        const stars = document.querySelectorAll('.star');

        if (feedbackType) feedbackType.value = '';
        if (feedbackMessage) feedbackMessage.value = '';
        if (feedbackEmail) feedbackEmail.value = '';
        
        stars.forEach(star => star.classList.remove('active'));
    }

    /**
     * Submit feedback to Google Sheets
     */
    async submitFeedback() {
        const feedbackType = document.getElementById('feedback-type');
        const feedbackMessage = document.getElementById('feedback-message-text');
        const feedbackEmail = document.getElementById('feedback-email');
        const activeStars = document.querySelectorAll('.star.active');

        const feedback = {
            sessionId: this.uniqueSessionId,
            type: feedbackType?.value || 'suggestion',
            rating: activeStars.length,
            message: feedbackMessage?.value || '',
            email: feedbackEmail?.value || '',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            examData: {
                selectedMock: this.selectedMock,
                questionsAnswered: this.userAnswers.filter(a => a !== null).length,
                totalQuestions: this.getCurrentMockQuestions().length,
                tabSwitchCount: this.tabSwitchCount,
                examDuration: this.examStartTime ? 
                    Math.round((new Date() - this.examStartTime) / 1000) : 0
            }
        };

        // Validate feedback
        if (!feedback.message.trim()) {
            alert('Please enter a message before submitting feedback.');
            return;
        }

        // Show loading state
        const submitBtn = document.getElementById('submit-feedback-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        try {
            // Submit to Google Sheets using Apps Script Web App
            await this.submitToGoogleSheets(feedback);
            
            console.log('Feedback submitted successfully:', feedback);
            this.showFeedbackSuccess();
            
            // Hide modal after success message display time
            setTimeout(() => {
                this.hideFeedbackModal();
            }, this.feedbackSuccessDisplayTime);
            
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            
            // Fallback: Store locally and show alternative success
            this.storeFeedbackLocally(feedback);
            this.showFeedbackSuccess('Your feedback has been saved locally. Thank you!');
            
            setTimeout(() => {
                this.hideFeedbackModal();
            }, this.feedbackSuccessDisplayTime);
        } finally {
            // Restore button state
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    /**
     * Submit feedback to Google Sheets via Apps Script
     */
    async submitToGoogleSheets(feedback) {
        // Google Apps Script Web App URL - Your actual deployment URL
        const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbydpaZ1AKQDY6dPNT8xMBU1o060xorrBx_FxaNbNDe6MYymXOOHpJ7zXr6OWjMueOhD/exec';
        
        // Note: In a real implementation, you would:
        // 1. Create a Google Apps Script that accepts POST requests
        // 2. Configure it to write to a Google Sheet
        // 3. Replace YOUR_SCRIPT_ID with the actual script ID
        
        const response = await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors', // Required for Apps Script
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(feedback)
        });
        
        // Note: Due to no-cors mode, we can't check response status
        // The request will be sent but we won't know if it succeeded
        console.log('Feedback sent to Google Sheets (no-cors mode)');
    }

    /**
     * Store feedback locally as fallback
     */
    storeFeedbackLocally(feedback) {
        try {
            const storedFeedback = JSON.parse(localStorage.getItem('hcia-feedback') || '[]');
            storedFeedback.push(feedback);
            
            // Keep only last 50 feedback entries
            if (storedFeedback.length > 50) {
                storedFeedback.splice(0, storedFeedback.length - 50);
            }
            
            localStorage.setItem('hcia-feedback', JSON.stringify(storedFeedback));
            console.log('Feedback stored locally');
        } catch (error) {
            console.error('Failed to store feedback locally:', error);
        }
    }

    /**
     * Show feedback success message
     */
    showFeedbackSuccess(customMessage = null) {
        console.log('🎉 Showing feedback success message');
        const feedbackBody = document.querySelector('.feedback-body');
        
        if (!feedbackBody) {
            console.error('❌ Feedback body element not found');
            return;
        }
        
        const message = customMessage || 'Your feedback has been received and will help improve the application.';
        console.log('📝 Success message:', message);
        
        feedbackBody.innerHTML = `
            <div class="feedback-success" id="feedback-success-container">
                <div class="success-icon">✅</div>
                <h3>Thank You!</h3>
                <p>${message}</p>
                <p>You can also reach out on social media:</p>
                <div class="success-social-links">
                    <a href="https://github.com/stilla1ex" target="_blank" class="social-link github">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        GitHub
                    </a>
                    <a href="https://twitter.com/stilla1ex" target="_blank" class="social-link twitter">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                        </svg>
                        Twitter
                    </a>
                </div>
                <div class="dismiss-hint">
                    <small>💡 Click anywhere to close this message</small>
                </div>
            </div>
        `;
        
        // Add click-to-dismiss functionality
        const successContainer = document.getElementById('feedback-success-container');
        if (successContainer) {
            successContainer.style.cursor = 'pointer';
            successContainer.addEventListener('click', () => {
                console.log('👆 User clicked to dismiss feedback success message');
                this.hideFeedbackModal();
            });
        }
        
        console.log('✅ Feedback success message displayed successfully');
    }

    /**
     * Show the issue report modal
     */
    showIssueReportModal() {
        // Populate context information
        this.updateIssueContext();
        
        const modal = document.getElementById('issue-report-modal');
        if (modal) {
            modal.style.display = 'flex';
            // Add show class with slight delay for smooth animation
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
        }
    }

    /**
     * Hide the issue report modal
     */
    hideIssueReportModal() {
        const modal = document.getElementById('issue-report-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                this.resetIssueForm();
            }, 300);
        }
    }

    /**
     * Update context information in the issue form
     */
    updateIssueContext() {
        // Get current page context
        const currentPage = document.querySelector('.page.active');
        let context = 'Unknown';
        
        if (currentPage) {
            switch (currentPage.id) {
                case 'home-page':
                    context = 'Home Page';
                    break;
                case 'question-page':
                    context = `Question Page - Question ${this.currentQuestionIndex + 1}`;
                    break;
                case 'results-page':
                    context = 'Results Page';
                    break;
            }
        }

        // Update context display
        const contextPage = document.getElementById('context-page');
        const contextBrowser = document.getElementById('context-browser');
        const contextTimestamp = document.getElementById('context-timestamp');

        if (contextPage) contextPage.textContent = context;
        if (contextBrowser) contextBrowser.textContent = this.getBrowserInfo();
        if (contextTimestamp) contextTimestamp.textContent = new Date().toLocaleString();
    }

    /**
     * Get simplified browser information
     */
    getBrowserInfo() {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return 'Unknown';
    }

    /**
     * Reset the issue report form
     */
    resetIssueForm() {
        const form = document.querySelector('.issue-form');
        if (form) {
            // Reset select elements
            document.getElementById('issue-type').value = 'bug';
            document.getElementById('issue-severity').value = 'low';
            
            // Reset input fields
            document.getElementById('issue-title').value = '';
            document.getElementById('issue-description').value = '';
            document.getElementById('issue-expected').value = '';
            document.getElementById('issue-contact').value = '';
        }
    }

    /**
     * Submit the issue report
     */
    submitIssueReport() {
        // Get form data
        const issueType = document.getElementById('issue-type').value;
        const severity = document.getElementById('issue-severity').value;
        const title = document.getElementById('issue-title').value.trim();
        const description = document.getElementById('issue-description').value.trim();
        const expected = document.getElementById('issue-expected').value.trim();
        const contact = document.getElementById('issue-contact').value.trim();

        // Validation
        if (!title) {
            alert('Please provide an issue title.');
            document.getElementById('issue-title').focus();
            return;
        }

        if (!description) {
            alert('Please provide a detailed description of the issue.');
            document.getElementById('issue-description').focus();
            return;
        }

        // Get context information
        const contextPage = document.getElementById('context-page').textContent;
        const contextBrowser = document.getElementById('context-browser').textContent;
        const contextTimestamp = document.getElementById('context-timestamp').textContent;

        // Create email content
        const subject = encodeURIComponent(`[${severity.toUpperCase()}] ${issueType.toUpperCase()}: ${title}`);
        const body = encodeURIComponent(`
HCIA Security Mock Exam - Issue Report

Issue Type: ${issueType.charAt(0).toUpperCase() + issueType.slice(1)}
Severity: ${severity.charAt(0).toUpperCase() + severity.slice(1)}
Title: ${title}

DESCRIPTION:
${description}

EXPECTED BEHAVIOR:
${expected || 'Not specified'}

SYSTEM INFORMATION:
- Page: ${contextPage}
- Browser: ${contextBrowser}
- Timestamp: ${contextTimestamp}
- URL: ${window.location.href}
- User Agent: ${navigator.userAgent}

CONTACT INFORMATION:
${contact || 'Not provided'}

---
This issue was reported via the HCIA Security Mock Exam application.
        `);

        // Create mailto link
        const mailtoLink = `mailto:stilla1ex@gmail.com?subject=${subject}&body=${body}`;
        
        // Open email client
        try {
            window.location.href = mailtoLink;
            this.showIssueSubmissionSuccess();
        } catch (error) {
            this.showEmailFallback();
        }
    }

    /**
     * Show success message after issue submission
     */
    showIssueSubmissionSuccess() {
        // Hide the modal
        this.hideIssueReportModal();
        
        // Show success message
        setTimeout(() => {
            alert('Thank you for your report! Your email client should have opened with the issue details. Please send the email to complete your report.');
        }, 300);
    }

    /**
     * Handle report issue functionality (legacy method)
     */
    reportIssue() {
        this.showIssueReportModal();
    }

    /**
     * Setup mobile-specific optimizations
     */
    setupMobileOptimizations() {
        // Prevent zoom on input focus for iOS
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            const inputs = document.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (!input.style.fontSize) {
                    input.style.fontSize = '16px';
                }
            });
        }
        
        // Add touch event handling for better mobile experience
        this.setupTouchEvents();
        
        // Setup viewport height fix for mobile browsers
        this.setupViewportFix();
        
        // Setup orientation change handling
        this.setupOrientationChange();
        
        // Prevent double-tap zoom on buttons
        this.preventDoubleTabZoom();
        
        // Ensure navigation is always accessible on mobile
        this.ensureNavigationAccessibility();
    }

    /**
     * Setup touch events for better mobile interaction
     */
    setupTouchEvents() {
        // Add touch feedback to buttons
        const interactiveElements = document.querySelectorAll('.btn, .mock-btn, .answer-option, .social-link');
        
        interactiveElements.forEach(element => {
            element.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
                this.style.opacity = '0.8';
            }, { passive: true });
            
            element.addEventListener('touchend', function() {
                setTimeout(() => {
                    this.style.transform = '';
                    this.style.opacity = '';
                }, 100);
            }, { passive: true });
            
            element.addEventListener('touchcancel', function() {
                this.style.transform = '';
                this.style.opacity = '';
            }, { passive: true });
        });
    }

    /**
     * Fix viewport height issues on mobile browsers
     */
    setupViewportFix() {
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setVH();
        window.addEventListener('resize', setVH);
        window.addEventListener('orientationchange', () => {
            setTimeout(setVH, 100);
        });
    }

    /**
     * Handle orientation changes
     */
    setupOrientationChange() {
        window.addEventListener('orientationchange', () => {
            // Force reflow to handle orientation change
            setTimeout(() => {
                window.scrollTo(0, 0);
                
                // Adjust question container height in landscape
                const questionContainer = document.querySelector('.question-container');
                if (questionContainer && window.innerHeight < window.innerWidth) {
                    questionContainer.style.maxHeight = `${window.innerHeight - 120}px`;
                } else if (questionContainer) {
                    questionContainer.style.maxHeight = '';
                }
            }, 200);
        });
    }

    /**
     * Prevent double-tap zoom on buttons
     */
    preventDoubleTabZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(event) {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }

    /**
     * Show email fallback if mailto doesn't work
     */
    showEmailFallback() {
        alert(`Your email client could not be opened automatically.\n\nPlease manually send your issue report to: stilla1ex@gmail.com\n\nInclude details about:\n- What page you were on\n- What you were trying to do\n- What went wrong\n- Your browser and device info`);
    }

    /**
     * Ensure navigation buttons are always accessible on mobile devices
     */
    ensureNavigationAccessibility() {
        // For screens smaller than 768px, add enhanced scroll behavior
        if (window.innerWidth <= 768) {
            // Add visual indicator if content is scrollable
            const answerOptions = document.querySelector('.answer-options');
            const questionNavigation = document.querySelector('.question-navigation');
            
            if (answerOptions && questionNavigation) {
                // Add scroll indicator for answer options
                const addScrollIndicator = () => {
                    const hasScrollableContent = answerOptions.scrollHeight > answerOptions.clientHeight;
                    
                    if (hasScrollableContent) {
                        answerOptions.classList.add('scrollable-content');
                        
                        // Add CSS for scroll indicator if not already added
                        if (!document.querySelector('#scroll-indicator-style')) {
                            const style = document.createElement('style');
                            style.id = 'scroll-indicator-style';
                            style.textContent = `
                                .scrollable-content::after {
                                    content: '⇩ Scroll for more';
                                    position: absolute;
                                    bottom: 0;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    background: rgba(66, 153, 225, 0.9);
                                    color: white;
                                    padding: 0.25rem 0.5rem;
                                    border-radius: 4px;
                                    font-size: 0.7rem;
                                    pointer-events: none;
                                    z-index: 10;
                                }
                                .scrollable-content.scrolled-to-bottom::after {
                                    display: none;
                                }
                            `;
                            document.head.appendChild(style);
                        }
                        
                        // Hide indicator when scrolled to bottom
                        answerOptions.addEventListener('scroll', () => {
                            const isScrolledToBottom = answerOptions.scrollTop + answerOptions.clientHeight >= answerOptions.scrollHeight - 5;
                            answerOptions.classList.toggle('scrolled-to-bottom', isScrolledToBottom);
                        });
                    }
                };
                
                // Auto-scroll to navigation after selecting an answer on very small screens
                if (window.innerWidth <= 480) {
                    const answers = document.querySelectorAll('.answer-option input');
                    answers.forEach(answer => {
                        answer.addEventListener('change', () => {
                            setTimeout(() => {
                                questionNavigation.scrollIntoView({ 
                                    behavior: 'smooth', 
                                    block: 'nearest',
                                    inline: 'nearest'
                                });
                            }, 300);
                        });
                    });
                }
                
                // Call on question display
                setTimeout(addScrollIndicator, 100);
            }
        }
    }
}

/**
 * Initialize the application when the DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Huawei Mock Exam Application...');
    
    // Create and start the exam application
    window.examApp = new ExamApp();
    
    console.log('Application ready for use!');
});
