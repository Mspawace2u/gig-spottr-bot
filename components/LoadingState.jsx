import { useState, useEffect } from 'react';
import { brandConfig } from '../config/brand.js';

export default function LoadingState() {
    const [message, setMessage] = useState(brandConfig.copy.loadingMessages[0]);

    useEffect(() => {
        // Pick a random loading message on mount
        const randomMessage = brandConfig.copy.loadingMessages[
            Math.floor(Math.random() * brandConfig.copy.loadingMessages.length)
        ];
        setMessage(randomMessage);
    }, []);

    return (
        <div className="loading-container">
            <div className="spinner"></div>
            <p className="loading-text">{message}</p>
        </div>
    );
}
