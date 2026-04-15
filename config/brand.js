// GiggrOS brand configuration - colors, fonts, copy (reusable across all agents)

export const brandConfig = {
    // Agent Army Palette
    colors: {
        cyan: '#2DE2E6',
        yellow: '#FFE44D',
        hotPink: '#FF2F92',
        purple: '#9B5CFF',
        mint: '#3CFF9E',
        black: '#050505',

        // Semantic assignments
        primary: '#FF2F92',      // Hot pink - primary CTA
        secondary: '#2DE2E6',    // Cyan - highlights
        tertiary: '#9B5CFF',     // Purple - accents

        // UI colors
        bgDark: '#050505',
        bgCard: '#1a1a1a',
        textPrimary: '#ffffff',
        textSecondary: '#a0a0a0',
        borderColor: '#2a2a2a'
    },

    // Typography
    fonts: {
        primary: "'SUSE', sans-serif",
        mono: "'SUSE Mono', monospace"
    },

    // Copy/Microcopy (GiggrOS voice)
    copy: {
        // Loading states
        loadingMessages: [
            "Extracting My Gig Filler DNA 🧬",
            "Checking the Reqs 📌",
            "Running the Numbers ⚡",
            "Almost There 🚀"
        ],

        // Button labels
        buttons: {
            primary: "RUN THIS MOVE",
            secondary: "SHIFT HERE",
            cancel: "BACK OUT",
            confirm: "LOCK IT IN"
        },

        // Status labels
        status: {
            pending: "Pending",
            applied: "Applied",
            skipped: "Skipped",
            received: "Received",
            interviewed: "Interviewed",
            denied: "Denied",
            offered: "Offered",
            accepted: "Accepted"
        },

        // Recommendations
        recommendations: {
            apply: "APPLY",
            dontApply: "DON'T APPLY"
        },

        // Error messages (Patty voice)
        errors: {
            generic: "Something broke. Try again.",
            noCV: "Upload your CV first.",
            noJob: "Paste a job URL or description.",
            apiError: "The AI is taking a break. Try again in a sec.",
            notionError: "Can't reach the database. Check your connection."
        }
    },

    // UI patterns
    ui: {
        // Border radius
        borderRadius: {
            small: '8px',
            medium: '12px',
            large: '22px',
            pill: '9999px'
        },

        // Shadows
        shadows: {
            glow: '0 0 20px rgba(255, 47, 146, 0.3)',
            glowCyan: '0 0 20px rgba(45, 226, 230, 0.3)',
            glowPurple: '0 0 20px rgba(155, 92, 255, 0.3)',
            card: '0 8px 32px 0 rgba(255, 47, 146, 0.1)'
        },

        // Glassmorphism
        glass: {
            background: 'rgba(26, 26, 26, 0.6)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
        }
    }
};
