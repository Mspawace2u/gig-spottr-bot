export default function Card({ children, className = '' }) {
    return (
        <div className={`vibe-glass rounded-[24px] p-6 sm:p-8 ${className}`}>
            {children}
        </div>
    );
}
