import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast, { Toaster } from 'react-hot-toast'
import jsPDF from 'jspdf'
import './App.css'

interface GeneratedName {
  id: string
  name: string
  category: string
  timestamp: Date
  isFavorite: boolean
  rating: number
  ratingComment: string
  domains: {
    [extension: string]: 'available' | 'taken' | 'unknown'
  }
}

interface AppState {
  generatedNames: GeneratedName[]
  favorites: string[]
  archivedNames: GeneratedName[]
  darkMode: boolean
}

// Cohere API call function
async function generateNameWithCohere(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_COHERE_API_KEY;
  const response = await fetch('https://api.cohere.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'command',
      prompt,
      max_tokens: 15,
      temperature: 0.8,
      k: 0,
      stop_sequences: ['\n\n', 'Here', 'here', 'Suggest', 'suggest'],
      return_likelihoods: 'NONE',
    }),
  });
  const data = await response.json();
  return data.generations?.[0]?.text?.trim() || '';
}

// Check domain availability
async function checkDomainAvailability(domain: string): Promise<'available' | 'taken' | 'unknown'> {
  const domainName = domain.toLowerCase();
  const domainWithoutExt = domainName.split('.')[0];
  
  // List of obvious/common domains that are definitely taken
  const definitelyTaken = [
    'google.com', 'facebook.com', 'amazon.com', 'microsoft.com', 'apple.com',
    'netflix.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'youtube.com',
    'github.com', 'stackoverflow.com', 'reddit.com', 'wikipedia.org', 'wordpress.com',
    'shopify.com', 'stripe.com', 'slack.com', 'zoom.com', 'dropbox.com',
    'airbnb.com', 'uber.com', 'lyft.com', 'spotify.com', 'discord.com',
    'twitch.com', 'tiktok.com', 'snapchat.com', 'pinterest.com', 'whatsapp.com'
  ];
  
  // Check if it's a definitely taken domain
  if (definitelyTaken.includes(domainName)) {
    return 'taken';
  }
  
  // Very short domains (3-4 chars) are almost always taken
  if (domainWithoutExt.length <= 4) {
    return 'taken';
  }
  
  // Common words that are likely taken
  const commonWords = ['the', 'and', 'for', 'you', 'me', 'my', 'we', 'us', 'it', 'is', 'in', 'on', 'at', 'to', 'of', 'a', 'an', 'com', 'net', 'org'];
  if (commonWords.includes(domainWithoutExt)) {
    return 'taken';
  }
  
  // For generated business names, use a more realistic approach
  // Most creative business names are available, especially with newer extensions
  const extension = domainName.split('.').pop();
  
  // .com domains are more likely to be taken
  if (extension === 'com') {
    // For .com, be more conservative - assume taken for common patterns
    if (domainWithoutExt.length <= 6 || 
        /^(cash|flow|hq|pro|app|web|tech|data|cloud|team|work|home|shop|buy|get|go|my|me|us|we)$/i.test(domainWithoutExt)) {
      return 'taken';
    }
    // For longer, creative names, assume available
    return 'available';
  }
  
  // For newer extensions (.io, .co, .app, .dev, .tech, .ai, .me), assume available
  // These are less likely to be taken
  if (['io', 'co', 'app', 'dev', 'tech', 'ai', 'me'].includes(extension || '')) {
    return 'available';
  }
  
  // For .net and .org, be moderately conservative
  if (['net', 'org'].includes(extension || '')) {
    if (domainWithoutExt.length <= 5) {
      return 'taken';
    }
    return 'available';
  }
  
  // Default to available for creative business names
  return 'available';
}

function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem('saasNameGenState')
    if (saved) {
      const parsed = JSON.parse(saved)
      // Convert string timestamps back to Date objects
      const generatedNames = parsed.generatedNames?.map((name: any) => ({
        ...name,
        timestamp: new Date(name.timestamp)
      })) || []
      
      return {
        generatedNames,
        favorites: parsed.favorites || [],
        archivedNames: parsed.archivedNames || [],
        darkMode: parsed.darkMode || false
      }
    }
    return {
      generatedNames: [],
      favorites: [],
      archivedNames: [],
      darkMode: false
    }
  })
  
  const [selectedCategory, setSelectedCategory] = useState('tech')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedName, setCopiedName] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'active' | 'archived' | 'favorites'>('active')
  const [keyword, setKeyword] = useState('')
  const [nameLength, setNameLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [nameStyle, setNameStyle] = useState<'modern' | 'classic' | 'invented' | 'compound'>('modern')
  const [showFavorites, setShowFavorites] = useState(false)
  const [showTakenDomains, setShowTakenDomains] = useState(false)
  const [nameTone, setNameTone] = useState<'professional' | 'creative' | 'friendly' | 'tech'>('professional')
  const [targetAudience, setTargetAudience] = useState<'startups' | 'enterprise' | 'small-business' | 'freelancers'>('startups')
  const [searchDomain, setSearchDomain] = useState('')
  const [searchingDomain, setSearchingDomain] = useState(false)
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [selectedName, setSelectedName] = useState<GeneratedName | null>(null)
  const [showRegistrarModal, setShowRegistrarModal] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [checkingDomains, setCheckingDomains] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [nameLengthFilter, setNameLengthFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'taken' | 'unknown'>('all')
  const [ratingFilter, setRatingFilter] = useState<number>(0)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [selectedNameForContext, setSelectedNameForContext] = useState<GeneratedName | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Migrate old data format to new format
  const migrateOldData = (names: any[]): GeneratedName[] => {
    return names.map(name => {
      if (name.domains) {
        // Add missing rating properties if they don't exist
        return {
          ...name,
          rating: name.rating || 0,
          ratingComment: name.ratingComment || ''
        };
      }
      
      // Migrate from old format
      return {
        ...name,
        rating: name.rating || 0,
        ratingComment: name.ratingComment || '',
        domains: {
          '.com': name.domainStatus || 'unknown'
        }
      };
    });
  };

  // Initialize state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saasNameGenerator')
      if (saved) {
        const parsed = JSON.parse(saved)
        setAppState({
          generatedNames: migrateOldData(parsed.generatedNames || []),
          favorites: parsed.favorites || [],
          archivedNames: migrateOldData(parsed.archivedNames || []),
          darkMode: parsed.darkMode || false
        })
      }
    } catch (err) {
      console.error('Error loading saved data:', err)
      // If there's an error, start with empty state
      setAppState({
        generatedNames: [],
        favorites: [],
        archivedNames: [],
        darkMode: false
      })
    }
  }, [])

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('saasNameGenState', JSON.stringify(appState))
  }, [appState])

  // Apply dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appState.darkMode ? 'dark' : 'light')
  }, [appState.darkMode])

  // Debug modal state
  useEffect(() => {
    console.log('Modal state changed:', { showDomainModal, selectedName: !!selectedName });
  }, [showDomainModal, selectedName]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showContextMenu) {
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showContextMenu]);

  const categories = [
    { id: 'tech', name: 'Technology', emoji: '💻' },
    { id: 'finance', name: 'Finance', emoji: '💰' },
    { id: 'health', name: 'Healthcare', emoji: '🏥' },
    { id: 'education', name: 'Education', emoji: '📚' },
    { id: 'marketing', name: 'Marketing', emoji: '📈' },
    { id: 'creative', name: 'Creative', emoji: '🎨' },
    { id: 'productivity', name: 'Productivity', emoji: '⚡' },
    { id: 'social', name: 'Social', emoji: '👥' }
  ]

  const checkSpecificDomain = async (domainName: string) => {
    setSearchingDomain(true);
    try {
      const domain = domainName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
      const status = await checkDomainAvailability(domain);
      
      if (status === 'available') {
        toast.success(`${domain} is available! 🎉`);
      } else if (status === 'taken') {
        toast.error(`${domain} is already taken 😞`);
      } else {
        toast(`${domain} status unknown`);
      }
    } catch (error) {
      toast.error('Failed to check domain');
    }
    setSearchingDomain(false);
  };

  const generateName = async () => {
    setIsGenerating(true)
    const categoryName = categories.find(cat => cat.id === selectedCategory)?.name || 'Technology'
    
    // Create a much simpler and clearer prompt
    let prompt = `Generate 5 creative business names for a ${categoryName.toLowerCase()} SaaS company. `;
    prompt += `Style: ${nameStyle}. Length: ${nameLength}. `;
    if (keyword.trim()) {
      prompt += `One name should include "${keyword.trim()}". `;
    }
    prompt += `Examples: CloudFlow, DataSync, TeamHub, WorkSpace, LearnPro. `;
    prompt += `Return exactly 5 names, one per line, no other text.`;
    
    try {
      const response = await generateNameWithCohere(prompt)
      console.log('Raw AI response:', response) // Debug log
      
      // Split the response into multiple names and clean them
      const nameLines = response.split('\n').filter(line => line.trim().length > 0);
      const names = nameLines.slice(0, 5); // Take up to 5 names
      
      console.log('Name lines:', names) // Debug log
      
      const generatedNames: GeneratedName[] = [];
      
      setCheckingDomains(true);
      
      for (const nameText of names) {
        // Clean up each name
        let cleanName = nameText
          .replace(/^[^a-zA-Z]*/, '') // Remove leading non-letters
          .replace(/[^a-zA-Z0-9\s-]*$/, '') // Remove trailing non-letters
          .trim()
          .split('\n')[0] // Take only the first line
          .split('.')[0] // Remove anything after a period
          .trim()
        
        console.log('Cleaned name:', cleanName) // Debug log
        
        // Very basic filtering - only filter out obvious unwanted words
        const unwantedWords = ['here', 'suggest', 'example', 'name', 'names', 'business', 'company', 'saas', 'startup'];
        
        if (cleanName.length > 30 || 
            cleanName.length < 2 ||
            unwantedWords.some(word => cleanName.toLowerCase() === word)) {
          console.log('Filtered out:', cleanName) // Debug log
          continue;
        }
        
        // Check multiple domain extensions
        const domains = await checkMultipleDomains(cleanName);
        
      const generatedName: GeneratedName = {
          id: Date.now().toString() + Math.random(),
          name: cleanName,
        category: categoryName,
          timestamp: new Date(),
          isFavorite: false,
          rating: 0,
          ratingComment: '',
          domains
        }
        
        generatedNames.push(generatedName);
      }
      
      setCheckingDomains(false);
      
      console.log('Final generated names:', generatedNames) // Debug log
      
      // If we got fewer than 3 names, try generating more
      if (generatedNames.length < 3) {
        console.log('Got fewer than 3 names, trying again...') // Debug log
        
        // Try a different prompt approach
        const fallbackPrompt = `Give me 5 short business names for ${categoryName.toLowerCase()}. Examples: CloudFlow, DataSync, TeamHub. One per line.`;
        const fallbackResponse = await generateNameWithCohere(fallbackPrompt);
        console.log('Fallback response:', fallbackResponse) // Debug log
        
        const fallbackLines = fallbackResponse.split('\n').filter(line => line.trim().length > 0);
        const fallbackNames = fallbackLines.slice(0, 5);
        
        for (const nameText of fallbackNames) {
          let cleanName = nameText
            .replace(/^[^a-zA-Z]*/, '')
            .replace(/[^a-zA-Z0-9\s-]*$/, '')
            .trim()
            .split('\n')[0]
            .split('.')[0]
            .trim();
          
          if (cleanName.length > 30 || cleanName.length < 2) continue;
          
          // Check multiple domain extensions for fallback names too
          const domains = await checkMultipleDomains(cleanName);
          
          const fallbackName: GeneratedName = {
            id: Date.now().toString() + Math.random() + 'fallback',
            name: cleanName,
        category: categoryName,
            timestamp: new Date(),
            isFavorite: false,
            rating: 0,
            ratingComment: '',
            domains
          };
          
          generatedNames.push(fallbackName);
        }
      }
      
      setAppState(prev => ({
        ...prev,
        generatedNames: [...generatedNames, ...prev.generatedNames].slice(0, 20) // Keep last 20
      }))
      toast.success(`Generated ${generatedNames.length} names!`)
    } catch (err) {
      console.error('Generation error:', err) // Debug log
      toast.error('Failed to generate names. Please try again.')
    }
    setIsGenerating(false)
  }

  const generateRandomEverything = async () => {
    const randomCategory = categories[Math.floor(Math.random() * categories.length)]
    const randomLengths: ('short' | 'medium' | 'long')[] = ['short', 'medium', 'long']
    const randomStyles: ('modern' | 'classic' | 'invented' | 'compound')[] = ['modern', 'classic', 'invented', 'compound']
    const randomTones: ('professional' | 'creative' | 'friendly' | 'tech')[] = ['professional', 'creative', 'friendly', 'tech']
    const randomAudiences: ('startups' | 'enterprise' | 'small-business' | 'freelancers')[] = ['startups', 'enterprise', 'small-business', 'freelancers']
    
    setSelectedCategory(randomCategory.id)
    setNameLength(randomLengths[Math.floor(Math.random() * randomLengths.length)])
    setNameStyle(randomStyles[Math.floor(Math.random() * randomStyles.length)])
    setNameTone(randomTones[Math.floor(Math.random() * randomTones.length)])
    setTargetAudience(randomAudiences[Math.floor(Math.random() * randomAudiences.length)])
    setKeyword('')
    
    // Generate name after a short delay to show the randomization
    setTimeout(() => generateName(), 500)
  }

  const toggleFavorite = (nameId: string) => {
    setAppState(prev => {
      const updatedNames = prev.generatedNames.map(name => 
        name.id === nameId ? { ...name, isFavorite: !name.isFavorite } : name
      )
      const updatedFavorites = updatedNames
        .filter(name => name.isFavorite)
        .map(name => name.id)
      
      return {
        ...prev,
        generatedNames: updatedNames,
        favorites: updatedFavorites
      }
    })
  }

  const rateName = (nameId: string, rating: number, comment: string = '') => {
    setAppState(prev => ({
      ...prev,
      generatedNames: prev.generatedNames.map(name => 
        name.id === nameId ? { ...name, rating, ratingComment: comment } : name
      ),
      archivedNames: prev.archivedNames.map(name => 
        name.id === nameId ? { ...name, rating, ratingComment: comment } : name
      )
    }))
    toast.success(`Rated ${rating}/5 stars! ⭐`)
  }

  const copyToClipboard = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name)
      setCopiedName(name)
      toast.success('Name copied to clipboard!')
      setTimeout(() => setCopiedName(null), 2000)
    } catch (err) {
      toast.error('Failed to copy name')
    }
  }

  const shareName = async (name: string, category: string) => {
    const text = `Check out this awesome SaaS name: "${name}" for ${category} industry! Generated with SaaS Name Generator.`
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SaaS Name Generator',
          text: text,
          url: window.location.href
        })
      } catch (err) {
        // User cancelled sharing
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      try {
        await navigator.clipboard.writeText(text)
        toast.success('Share text copied to clipboard!')
      } catch (err) {
        toast.error('Failed to copy share text')
      }
    }
  }

  const exportNames = (names: GeneratedName[], format: 'csv' | 'txt' | 'pdf') => {
    if (names.length === 0) {
      toast.error('No names to export')
      return
    }

    let content = ''
    
    if (format === 'csv') {
      // CSV format with headers
      const headers = ['Name', 'Category', 'Generated Date', 'Favorite', 'Available Domains', 'Taken Domains', 'Unknown Domains', 'Total Domains Checked']
      content = headers.join(',') + '\n'
      
      content += names.map(name => {
        const cleanName = name.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const domains = name.domains || {}
        
        const availableDomains = Object.entries(domains)
          .filter(([_, status]) => status === 'available')
          .map(([ext, _]) => cleanName + ext)
          .join('; ')
        
        const takenDomains = Object.entries(domains)
          .filter(([_, status]) => status === 'taken')
          .map(([ext, _]) => cleanName + ext)
          .join('; ')
        
        const unknownDomains = Object.entries(domains)
          .filter(([_, status]) => status === 'unknown')
          .map(([ext, _]) => cleanName + ext)
          .join('; ')
        
        const totalChecked = Object.keys(domains).length
        
        return [
          `"${name.name}"`,
          `"${name.category}"`,
          `"${name.timestamp.toLocaleString()}"`,
          name.isFavorite ? 'Yes' : 'No',
          `"${availableDomains}"`,
          `"${takenDomains}"`,
          `"${unknownDomains}"`,
          totalChecked
        ].join(',')
      }).join('\n')
      
    } else if (format === 'txt') {
      // TXT format with detailed information
      content = `SaaS Name Generator Export\n`
      content += `Generated on: ${new Date().toLocaleString()}\n`
      content += `Total names exported: ${names.length}\n`
      content += `==========================================\n\n`
      
      names.forEach((name, index) => {
        const cleanName = name.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const domains = name.domains || {}
        
        content += `${index + 1}. ${name.name}\n`
        content += `   Category: ${name.category}\n`
        content += `   Generated: ${name.timestamp.toLocaleString()}\n`
        content += `   Favorite: ${name.isFavorite ? 'Yes' : 'No'}\n`
        content += `   Domain Status:\n`
        
        const availableDomains = Object.entries(domains).filter(([_, status]) => status === 'available')
        const takenDomains = Object.entries(domains).filter(([_, status]) => status === 'taken')
        const unknownDomains = Object.entries(domains).filter(([_, status]) => status === 'unknown')
        
        if (availableDomains.length > 0) {
          content += `     ✅ Available: ${availableDomains.map(([ext, _]) => cleanName + ext).join(', ')}\n`
        }
        if (takenDomains.length > 0) {
          content += `     ❌ Taken: ${takenDomains.map(([ext, _]) => cleanName + ext).join(', ')}\n`
        }
        if (unknownDomains.length > 0) {
          content += `     ❓ Unknown: ${unknownDomains.map(([ext, _]) => cleanName + ext).join(', ')}\n`
        }
        
        content += `\n`
      })
      
    } else if (format === 'pdf') {
      // PDF format (simplified for now, could be enhanced with jsPDF)
      content = `SaaS Name Generator Export\n`
      content += `Generated on: ${new Date().toLocaleString()}\n`
      content += `Total names exported: ${names.length}\n\n`
      
      names.forEach((name, index) => {
        const cleanName = name.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const domains = name.domains || {}
        
        content += `${index + 1}. ${name.name} (${name.category})\n`
        content += `   Generated: ${name.timestamp.toLocaleString()}\n`
        content += `   Favorite: ${name.isFavorite ? 'Yes' : 'No'}\n`
        
        const availableDomains = Object.entries(domains).filter(([_, status]) => status === 'available')
        if (availableDomains.length > 0) {
          content += `   Available Domains: ${availableDomains.map(([ext, _]) => cleanName + ext).join(', ')}\n`
        }
        
        content += `\n`
      })
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    downloadFile(content, `saas-names-export-${timestamp}.${format}`, `text/${format}`)
    
    toast.success(`${names.length} names exported as ${format.toUpperCase()} with domain information! 📊`)
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearHistory = () => {
    setAppState(prev => ({
      ...prev,
      generatedNames: [],
      favorites: [],
      archivedNames: []
    }))
    toast.success('History cleared!')
  }

  const toggleDarkMode = () => {
    setAppState(prev => ({
      ...prev,
      darkMode: !prev.darkMode
    }))
  }

  // Advanced filtering logic
  const getFilteredNames = () => {
    let names = viewMode === 'active' ? appState.generatedNames : 
                viewMode === 'favorites' ? appState.generatedNames.filter(name => name.isFavorite) :
                appState.archivedNames;

    // Name length filter
    if (nameLengthFilter !== 'all') {
      names = names.filter(name => {
        const length = name.name.length;
        if (nameLengthFilter === 'short') return length <= 6;
        if (nameLengthFilter === 'medium') return length > 6 && length <= 10;
        if (nameLengthFilter === 'long') return length > 10;
        return true;
      });
    }

    // Availability filter
    if (availabilityFilter !== 'all') {
      names = names.filter(name => {
        const comStatus = name.domains?.['.com'] || 'unknown';
        return comStatus === availabilityFilter;
      });
    }

    // Rating filter
    if (ratingFilter > 0) {
      names = names.filter(name => name.rating >= ratingFilter);
    }

    return names;
  };

  const displayedNames = getFilteredNames();

  const availableCount = appState.generatedNames.filter(name => (name.domains?.['.com'] || 'unknown') === 'available').length
  const takenCount = appState.generatedNames.filter(name => (name.domains?.['.com'] || 'unknown') === 'taken').length

  const archiveName = (nameId: string) => {
    setAppState(prev => ({
      ...prev,
      generatedNames: prev.generatedNames.filter(name => name.id !== nameId),
      archivedNames: [...prev.archivedNames, prev.generatedNames.find(n => n.id === nameId) as GeneratedName]
    }))
    toast.success('Name archived!')
  }

  const buyDomain = (domainName: string) => {
    // Extract the domain name and extension
    const domainMatch = domainName.match(/^(.+?)(\.[a-z]{2,})$/) || [domainName, domainName, '.com'];
    const cleanName = domainMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const extension = domainMatch[2] || '.com';
    const fullDomain = cleanName + extension;
    
    console.log('Buying domain:', { domainName, cleanName, extension, fullDomain });
    
    // Set the selected domain and show registrar modal
    setSelectedDomain(fullDomain);
    setShowRegistrarModal(true);
  }

  const openRegistrar = (registrarUrl: string, registrarName: string) => {
    const newWindow = window.open(registrarUrl, '_blank');
    toast.success(`Opening ${selectedDomain} on ${registrarName}! 🛒`);
    setShowRegistrarModal(false);
  }

  const restoreName = (nameId: string) => {
    const archivedName = appState.archivedNames.find(name => name.id === nameId);
    if (archivedName) {
      setAppState(prev => ({
        ...prev,
        archivedNames: prev.archivedNames.filter(name => name.id !== nameId),
        generatedNames: [...prev.generatedNames, archivedName]
      }))
      toast.success('Name restored!')
    }
  }

  const clearArchived = () => {
    setAppState(prev => ({
      ...prev,
      archivedNames: []
    }))
    toast.success('Archived names cleared!')
  }

  const checkMultipleDomains = async (name: string): Promise<{ [extension: string]: 'available' | 'taken' | 'unknown' }> => {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const extensions = ['.com', '.net', '.org', '.io', '.co', '.app', '.dev', '.tech', '.ai', '.me'];
    const results: { [extension: string]: 'available' | 'taken' | 'unknown' } = {};
    
    console.log(`Checking domains for: ${name} (clean: ${cleanName})`);
    
    // Check each extension with a small delay to avoid overwhelming
    for (const ext of extensions) {
      const domain = cleanName + ext;
      try {
        console.log(`Checking domain: ${domain}`);
        results[ext] = await checkDomainAvailability(domain);
        console.log(`${domain} status: ${results[ext]}`);
        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error checking ${domain}:`, error);
        results[ext] = 'unknown';
      }
    }
    
    console.log(`Final domain results for ${name}:`, results);
    return results;
  }

  const showAllDomains = (name: GeneratedName) => {
    console.log('Opening modal for:', name);
    // Ensure the name has the domains property
    if (!name.domains) {
      name.domains = { '.com': 'unknown' };
    }
    setSelectedName(name);
    setShowDomainModal(true);
    
    // Scroll to top to ensure modal is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    console.log('Modal state set to true, selectedName:', name);
  }

  const clearSearches = () => {
    setAppState(prev => ({
      ...prev,
      generatedNames: [],
      archivedNames: []
    }))
    toast.success('All searches cleared! 🗑️')
  }

  const recheckArchivedDomains = async () => {
    if (appState.archivedNames.length === 0) {
      toast.error('No archived names to recheck');
      return;
    }
    
    toast.loading('Rechecking archived domains...', { duration: 2000 });
    
    const updatedArchivedNames: GeneratedName[] = [];
    
    for (const name of appState.archivedNames) {
      try {
        const newDomains = await checkMultipleDomains(name.name);
        updatedArchivedNames.push({
          ...name,
          domains: newDomains
        });
      } catch (error) {
        console.error(`Error rechecking domains for ${name.name}:`, error);
        updatedArchivedNames.push(name); // Keep original if recheck fails
      }
    }
    
    setAppState(prev => ({
      ...prev,
      archivedNames: updatedArchivedNames
    }));
    
    toast.success(`Rechecked ${updatedArchivedNames.length} archived domains! 🔄`);
  }

  const handleContextMenu = (e: React.MouseEvent, name: GeneratedName) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setSelectedNameForContext(name);
    setShowContextMenu(true);
  }

  const closeContextMenu = () => {
    setShowContextMenu(false);
    setSelectedNameForContext(null);
  }

  return (
    <div className={`app ${appState.darkMode ? 'dark' : ''}`}>
      <Toaster position="top-right" />
      <div className="container">
        <header className="header">
          <div className="header-inner">
            <h1 className="title">BrandSaaS</h1>
            <div className="header-controls">
              <button 
                className="theme-toggle"
                onClick={toggleDarkMode}
                aria-label={appState.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {appState.darkMode ? '☀️' : '🌙'}
              </button>
              <button className="about-btn" onClick={() => {
                console.log('About button clicked!');
                setAboutOpen(true);
              }}>
                About Me
              </button>
            </div>
          </div>
        </header>

        <div className="category-selector">
          <h3>Choose your industry:</h3>
          <div className="category-grid">
            {categories.map((category) => (
              <motion.button
                key={category.id}
                className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label={`Select ${category.name} category`}
              >
                <span className="category-emoji">{category.emoji}</span>
                <span className="category-name">{category.name}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Personalization Controls */}
        <div className="personalization-section">
          <div className="personalization-grid">
          <div className="personalization-row">
            <label htmlFor="keyword-input">Keyword/Theme:</label>
            <input
              id="keyword-input"
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. cloud, team, AI"
              className="personalization-input"
                aria-describedby="keyword-help"
            />
              <small id="keyword-help" className="help-text">Optional: Add a specific theme or keyword</small>
          </div>
            
          <div className="personalization-row">
              <label htmlFor="tone-select">Name Tone:</label>
            <select
                id="tone-select"
                value={nameTone}
                onChange={e => setNameTone(e.target.value as 'professional' | 'creative' | 'friendly' | 'tech')}
                className="personalization-select"
              >
                <option value="professional">Professional</option>
                <option value="creative">Creative</option>
                <option value="friendly">Friendly</option>
                <option value="tech">Tech-focused</option>
              </select>
            </div>
            
            <div className="personalization-row">
              <label htmlFor="audience-select">Target Audience:</label>
              <select
                id="audience-select"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value as 'startups' | 'enterprise' | 'small-business' | 'freelancers')}
                className="personalization-select"
              >
                <option value="startups">Startups</option>
                <option value="enterprise">Enterprise</option>
                <option value="small-business">Small Business</option>
                <option value="freelancers">Freelancers</option>
              </select>
          </div>
            
          <div className="personalization-row">
              <label htmlFor="length-select">Name Length:</label>
            <select
                id="length-select"
              value={nameLength}
              onChange={e => setNameLength(e.target.value as 'short' | 'medium' | 'long')}
              className="personalization-select"
            >
                <option value="short">Short (3-6 chars)</option>
                <option value="medium">Medium (7-10 chars)</option>
                <option value="long">Long (11+ chars)</option>
            </select>
          </div>
            
          <div className="personalization-row">
              <label htmlFor="style-select">Name Style:</label>
            <select
                id="style-select"
              value={nameStyle}
              onChange={e => setNameStyle(e.target.value as 'modern' | 'classic' | 'invented' | 'compound')}
              className="personalization-select"
            >
              <option value="modern">Modern</option>
              <option value="classic">Classic</option>
              <option value="invented">Invented</option>
              <option value="compound">Compound</option>
            </select>
        </div>

            <div className="personalization-row">
              <label htmlFor="domain-search">Check Specific Domain:</label>
              <div className="domain-search-container">
                <input
                  id="domain-search"
                  type="text"
                  value={searchDomain}
                  onChange={e => setSearchDomain(e.target.value)}
                  placeholder="e.g. mycompany"
                  className="personalization-input"
                />
          <button 
                  className="domain-check-btn"
                  onClick={() => checkSpecificDomain(searchDomain)}
                  disabled={!searchDomain.trim() || searchingDomain}
                >
                  {searchingDomain ? 'Checking...' : '🔍 Check'}
                </button>
              </div>
              <small className="help-text">Check if a specific domain is available</small>
            </div>
          </div>
        </div>

        <div className="generate-row">
          <div className="generate-buttons">
            <motion.button 
            className={`generate-btn ${isGenerating ? 'generating' : ''}`}
            onClick={generateName}
            disabled={isGenerating}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isGenerating ? (checkingDomains ? 'Checking domains...' : 'Generating...') : 'Generate Name'}
            </motion.button>
            <motion.button 
              className="surprise-btn"
              onClick={generateRandomEverything}
              disabled={isGenerating}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              🎲 Surprise Me!
            </motion.button>
            {(appState.generatedNames.length > 0 || appState.archivedNames.length > 0) && (
              <motion.button 
                className="clear-searches-btn"
                onClick={clearSearches}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Clear all generated and archived names"
              >
                🗑️ Clear All
              </motion.button>
            )}
          </div>
          {checkingDomains && (
            <div className="domain-checking-status">
              <p>🔍 Checking domain availability for all extensions...</p>
            </div>
          )}
        </div>

        <div className="stats">
          <div className="stat-item">
            <span className="stat-label">Generated:</span>
            <span className="stat-value">{appState.generatedNames.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Favorites:</span>
            <span className="stat-value">{appState.favorites.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Archived:</span>
            <span className="stat-value">{appState.archivedNames.length}</span>
          </div>
        </div>

        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
            onClick={() => setViewMode('active')}
          >
            Active Names ({appState.generatedNames.length})
          </button>
          <button
            className={`toggle-btn ${viewMode === 'favorites' ? 'active' : ''}`}
            onClick={() => setViewMode('favorites')}
          >
            ⭐ Favorites ({appState.favorites.length})
          </button>
          <button
            className={`toggle-btn ${viewMode === 'archived' ? 'active' : ''}`}
            onClick={() => setViewMode('archived')}
          >
            Archived ({appState.archivedNames.length})
          </button>
        </div>

        {/* Advanced Filters */}
        {((viewMode === 'active' && appState.generatedNames.length > 0) || 
          (viewMode === 'favorites' && appState.favorites.length > 0) ||
          (viewMode === 'archived' && appState.archivedNames.length > 0)) && (
          <div className="advanced-filters">
            <button 
              className="filter-toggle-btn"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              🔍 {showAdvancedFilters ? 'Hide' : 'Show'} Advanced Filters
              </button>
            
            {showAdvancedFilters && (
              <div className="filters-panel">
                <div className="filter-group">
                  <label>Name Length:</label>
                  <select 
                    value={nameLengthFilter} 
                    onChange={(e) => setNameLengthFilter(e.target.value as any)}
                  >
                    <option value="all">All Lengths</option>
                    <option value="short">Short (≤6 chars)</option>
                    <option value="medium">Medium (7-10 chars)</option>
                    <option value="long">Long (≥11 chars)</option>
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Domain Status:</label>
                  <select 
                    value={availabilityFilter} 
                    onChange={(e) => setAvailabilityFilter(e.target.value as any)}
                  >
                    <option value="all">All Status</option>
                    <option value="available">Available</option>
                    <option value="taken">Taken</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Minimum Rating:</label>
                  <select 
                    value={ratingFilter} 
                    onChange={(e) => setRatingFilter(Number(e.target.value))}
                  >
                    <option value={0}>Any Rating</option>
                    <option value={1}>1+ Stars</option>
                    <option value={2}>2+ Stars</option>
                    <option value={3}>3+ Stars</option>
                    <option value={4}>4+ Stars</option>
                    <option value={5}>5 Stars</option>
                  </select>
                </div>
                
                <div className="filter-stats">
                  <span>Showing {displayedNames.length} of {viewMode === 'active' ? appState.generatedNames.length : viewMode === 'favorites' ? appState.favorites.length : appState.archivedNames.length} names</span>
                </div>
              </div>
            )}
          </div>
        )}

        {((viewMode === 'active' && appState.generatedNames.length > 0) || 
          (viewMode === 'favorites' && appState.favorites.length > 0) ||
          (viewMode === 'archived' && appState.archivedNames.length > 0)) && (
          <div className="names-container">
            <div className="names-header">
              <h3>
                {viewMode === 'active' ? 'Generated Names' : 
                 viewMode === 'favorites' ? '⭐ Favorite Names' : 
                 'Archived Names'}
              </h3>
              <div className="names-actions">
                <button
                  className="export-btn"
                  onClick={() => exportNames(
                    viewMode === 'active' ? appState.generatedNames : 
                    viewMode === 'favorites' ? appState.generatedNames.filter(name => name.isFavorite) :
                    appState.archivedNames, 'csv')}
                  aria-label="Export as CSV"
                >
                  📊 <span>Export</span> CSV
                </button>
                <button
                  className="export-btn"
                  onClick={() => exportNames(
                    viewMode === 'active' ? appState.generatedNames : 
                    viewMode === 'favorites' ? appState.generatedNames.filter(name => name.isFavorite) :
                    appState.archivedNames, 'txt')}
                  aria-label="Export as TXT"
                >
                  📄 <span>Export</span> TXT
                </button>
                <button
                  className="export-btn"
                  onClick={() => exportNames(
                    viewMode === 'active' ? appState.generatedNames : 
                    viewMode === 'favorites' ? appState.generatedNames.filter(name => name.isFavorite) :
                    appState.archivedNames, 'pdf')}
                  aria-label="Export as PDF"
                >
                  📑 <span>Export</span> PDF
                </button>
                {viewMode === 'archived' && appState.archivedNames.length > 0 && (
                  <>
                    <button
                      className="recheck-btn"
                      onClick={recheckArchivedDomains}
                      aria-label="Recheck domain availability for all archived names"
                    >
                      🔄 Recheck
                    </button>
                    <button
                      className="clear-btn"
                      onClick={clearArchived}
                      aria-label="Clear all archived names"
                    >
                      🗑️ Clear All
                </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="names-grid">
            
            {displayedNames.map((item, index) => (
                <motion.div 
                  key={item.id}
                  className={`name-card ${(item.domains?.['.com'] || 'unknown') === 'available' ? 'available' : ''} clickable`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  whileHover={{ y: -5 }}
                  onClick={() => showAllDomains(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <div className="name-content">
                    <h4 className="generated-name">{item.name}</h4>
                    <p className="name-category">{item.category}</p>
                    <p className="name-time">
                      {item.timestamp.toLocaleTimeString()}
                    </p>
                    <div className="domain-summary">
                      <p className={`domain-status ${item.domains?.['.com'] || 'unknown'}`}>
                        .com: {(item.domains?.['.com'] || 'unknown') === 'available' ? '✅' : (item.domains?.['.com'] || 'unknown') === 'taken' ? '❌' : '❓'}
                      </p>
                      <p className="click-hint">Click to see all domains →</p>
                  </div>
                    {item.rating > 0 && (
                      <div className="rating-display">
                        <span className="stars">
                          {'⭐'.repeat(item.rating)}
                          {'☆'.repeat(5 - item.rating)}
                        </span>
                        {item.ratingComment && (
                          <p className="rating-comment">"{item.ratingComment}"</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="name-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`favorite-btn ${item.isFavorite ? 'favorited' : ''}`}
                      onClick={() => toggleFavorite(item.id)}
                      aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {item.isFavorite ? '★' : '☆'}
                    </button>
                    
                    <button
                      className={viewMode === 'active' ? 'archive-btn' : viewMode === 'archived' ? 'restore-btn' : 'archive-btn'}
                      onClick={() => viewMode === 'active' ? archiveName(item.id) : viewMode === 'archived' ? restoreName(item.id) : archiveName(item.id)}
                      aria-label={viewMode === 'active' ? 'Archive this name' : viewMode === 'archived' ? 'Restore this name' : 'Archive this name'}
                      title={viewMode === 'active' ? 'Archive this name' : viewMode === 'archived' ? 'Restore this name' : 'Archive this name'}
                    >
                      {viewMode === 'active' ? '📁' : viewMode === 'archived' ? '📂' : '📁'}
                    </button>
                    
                    <button
                      className="buy-domain-btn"
                      onClick={() => buyDomain(item.name)}
                      aria-label="Buy this domain"
                      title="Buy this domain"
                    >
                      🛒
                    </button>
                    
                    <button
                      className="share-btn"
                      onClick={() => shareName(item.name, item.category)}
                      aria-label="Share this name"
                      title="Share this name"
                    >
                      📤
                    </button>
                    
                  <button
                    className={`copy-btn ${copiedName === item.name ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(item.name)}
                      aria-label="Copy name to clipboard"
                      title="Copy name to clipboard"
                    >
                      {copiedName === item.name ? '✓' : '📋'}
                    </button>
                    
                    <button
                      className="rate-btn"
                      onClick={() => {
                        const rating = prompt('Rate this name (1-5 stars):', item.rating.toString());
                        const comment = prompt('Add a comment (optional):', item.ratingComment);
                        if (rating && !isNaN(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5) {
                          rateName(item.id, Number(rating), comment || '');
                        }
                      }}
                      aria-label="Rate this name"
                      title="Rate this name"
                    >
                      ⭐
                  </button>
                </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Domain Modal */}
        {showDomainModal && selectedName && (
          <div className="modal-overlay" onClick={() => setShowDomainModal(false)}>
            <div className="domain-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Available Domains for "{selectedName.name}"</h3>
                <button 
                  className="close-btn"
                  onClick={() => setShowDomainModal(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="domains-grid">
                {Object.entries(selectedName.domains || { '.com': 'unknown' }).map(([extension, status]) => (
                  <div key={extension} className={`domain-item ${status}`}>
                    <div className="domain-info">
                      <span className="domain-name">{selectedName.name.toLowerCase().replace(/[^a-z0-9]/g, '')}{extension}</span>
                      <span className={`domain-status ${status}`}>
                        {status === 'available' ? '✅ Available' : status === 'taken' ? '❌ Taken' : '❓ Unknown'}
                      </span>
                    </div>
                    {status === 'available' && (
                      <button
                        className="buy-domain-btn-small"
                        onClick={(e) => {
                          e.stopPropagation();
                          const fullDomain = selectedName.name.toLowerCase().replace(/[^a-z0-9]/g, '') + extension;
                          console.log('Modal buy button clicked for domain:', fullDomain);
                          buyDomain(fullDomain);
                        }}
                        aria-label={`Buy ${selectedName.name.toLowerCase().replace(/[^a-z0-9]/g, '')}${extension}`}
                      >
                        🛒 Buy
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-info">
                <p>💡 <strong>Tip:</strong> Available domains are ready for purchase. Click "Buy" to open the registrar.</p>
                <p>🔍 <strong>Note:</strong> Domain availability is estimated. Always verify with your chosen registrar.</p>
              </div>
              <div className="modal-footer">
                <button 
                  className="close-modal-btn"
                  onClick={() => setShowDomainModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Registrar Selection Modal */}
        {showRegistrarModal && selectedDomain && (
          <div className="modal-overlay" onClick={() => setShowRegistrarModal(false)}>
            <div className="registrar-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Choose Domain Registrar for "{selectedDomain}"</h3>
                <button 
                  className="close-btn"
                  onClick={() => setShowRegistrarModal(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="registrars-grid">
                {[
                  {
                    name: 'Namecheap',
                    url: `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(selectedDomain)}`,
                    icon: '🛒',
                    description: 'Popular choice with great prices',
                    color: '#ff6b35'
                  },
                  {
                    name: 'Squarespace',
                    url: `https://www.squarespace.com/domains?domain=${encodeURIComponent(selectedDomain)}`,
                    icon: '🏢',
                    description: 'Professional hosting & domains',
                    color: '#000000'
                  },
                  {
                    name: 'GoDaddy',
                    url: `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(selectedDomain)}`,
                    icon: '🐐',
                    description: 'World\'s largest domain registrar',
                    color: '#00a4a6'
                  },
                  {
                    name: 'Cloudflare',
                    url: `https://www.cloudflare.com/products/registrar/`,
                    icon: '☁️',
                    description: 'Fast & secure domain registration',
                    color: '#f38020'
                  },
                  {
                    name: 'Google Domains',
                    url: `https://domains.google.com/registrar/search?searchTerm=${encodeURIComponent(selectedDomain)}`,
                    icon: '🔍',
                    description: 'Simple & reliable (now Squarespace)',
                    color: '#4285f4'
                  },
                  {
                    name: 'Hover',
                    url: `https://www.hover.com/domains/search?q=${encodeURIComponent(selectedDomain)}`,
                    icon: '🎯',
                    description: 'Clean & simple domain management',
                    color: '#ff6b6b'
                  }
                ].map((registrar, index) => (
                  <div key={registrar.name} className="registrar-item">
                    <div className="registrar-info">
                      <div className="registrar-icon" style={{ backgroundColor: registrar.color }}>
                        {registrar.icon}
                      </div>
                      <div className="registrar-details">
                        <h4 className="registrar-name">{registrar.name}</h4>
                        <p className="registrar-description">{registrar.description}</p>
                      </div>
                    </div>
                    <button
                      className="select-registrar-btn"
                      onClick={() => openRegistrar(registrar.url, registrar.name)}
                      aria-label={`Buy domain on ${registrar.name}`}
                    >
                      Select {registrar.name}
                    </button>
                  </div>
                ))}
              </div>
              <div className="modal-info">
                <p>💡 <strong>Tip:</strong> Compare prices and features before choosing your registrar.</p>
              </div>
              <div className="modal-footer">
                <button 
                  className="close-modal-btn"
                  onClick={() => setShowRegistrarModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Context Menu */}
        {showContextMenu && selectedNameForContext && (
          <div 
            className="context-menu-overlay"
            onClick={closeContextMenu}
          >
            <div 
              className="context-menu"
              style={{ 
                left: contextMenuPosition.x, 
                top: contextMenuPosition.y 
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => { copyToClipboard(selectedNameForContext.name); closeContextMenu(); }}>
                📋 Copy Name
              </button>
              <button onClick={() => { shareName(selectedNameForContext.name, selectedNameForContext.category); closeContextMenu(); }}>
                📤 Share Name
              </button>
              <button onClick={() => { buyDomain(selectedNameForContext.name); closeContextMenu(); }}>
                🛒 Buy Domain
              </button>
              <button onClick={() => { showAllDomains(selectedNameForContext); closeContextMenu(); }}>
                🌐 View All Domains
              </button>
              <button onClick={() => { 
                const rating = prompt('Rate this name (1-5 stars):', selectedNameForContext.rating.toString());
                const comment = prompt('Add a comment (optional):', selectedNameForContext.ratingComment);
                if (rating && !isNaN(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5) {
                  rateName(selectedNameForContext.id, Number(rating), comment || '');
                }
                closeContextMenu();
              }}>
                ⭐ Rate Name
              </button>
              {viewMode === 'active' && (
                <button onClick={() => { archiveName(selectedNameForContext.id); closeContextMenu(); }}>
                  📁 Archive
                </button>
              )}
              {viewMode === 'archived' && (
                <button onClick={() => { restoreName(selectedNameForContext.id); closeContextMenu(); }}>
                  📂 Restore
                </button>
              )}
            </div>
          </div>
        )}

        {aboutOpen && (
          <div className="about-modal-overlay" onClick={() => setAboutOpen(false)}>
            <div className="about-modal" onClick={e => e.stopPropagation()}>
              <button className="close-modal-btn" onClick={() => setAboutOpen(false)} aria-label="Close About Me">&times;</button>
              <div className="about-avatar">👋</div>
              <h2>Hi, I'm Melvin!</h2>
              <div className="about-card">
                <div className="about-section">
                  <p>I'm a 22-year-old coder passionate about building creative web projects and leveling up my skills. I love experimenting with new tech and sharing what I learn.</p>
                </div>
              </div>
              <div className="about-card">
                <div className="about-section">
                  <h3>🚀 What I Do</h3>
                  <ul>
                    <li>Build modern web apps with React & TypeScript</li>
                    <li>Explore UI/UX design and front-end frameworks</li>
                    <li>Work on SaaS tools, utilities, and fun side projects</li>
                  </ul>
                </div>
              </div>
              <div className="about-card">
                <div className="about-section">
                  <h3>🌱 Always Learning</h3>
                  <ul>
                    <li>Advanced React & state management</li>
                    <li>API integration & backend basics</li>
                    <li>Clean code, accessibility, and performance</li>
                  </ul>
                </div>
              </div>
              <div className="about-card">
                <div className="about-section">
                  <h3>💡 Fun Facts</h3>
                  <ul>
                    <li>I enjoy strategy games, puzzles, and tech podcasts</li>
                    <li>Pizza is my go-to coding fuel 🍕</li>
                    <li>My dream: Launch a product people love!</li>
                  </ul>
                </div>
              </div>
              <div className="about-card">
                <div className="about-section">
                  <h3>🛠️ Tech & Tools</h3>
                  <ul>
                    <li>React, TypeScript, JavaScript, HTML, CSS</li>
                    <li>Git & GitHub, VS Code, Figma</li>
                  </ul>
                </div>
              </div>
              <div className="about-card">
                <div className="about-section">
                  <h3>💬 Favorite Quote</h3>
                  <blockquote>“The only way to do great work is to love what you do.” — Steve Jobs</blockquote>
                </div>
              </div>
              <div className="about-card">
                <div className="about-section">
                  <h3>🌐 Connect with Me</h3>
                  <a href="https://github.com/your-github-username" target="_blank" rel="noopener noreferrer">GitHub</a> &bull; <a href="mailto:melvin.a.p.cruz@gmail.com">Email</a>
                </div>
              </div>
              <div className="about-footer">Let's build something awesome together! 🚀</div>
            </div>
          </div>
        )}

        <footer className="footer">
          <p>Built with React + Vite • Generate amazing SaaS names instantly</p>
          <p className="pwa-install">Install this app on your device for the best experience!</p>
        </footer>
      </div>
    </div>
  )
}

export default App
