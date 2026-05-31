import ReactMarkdown from 'react-markdown';

interface PreviewProps {
  content: string;
}

const Preview = ({ content }: PreviewProps) => {
  return (
    <div className="h-full overflow-auto p-6 bg-gray-50">
      <div className="markdown-preview">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default Preview;
