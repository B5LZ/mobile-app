import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, 
  TouchableOpacity, Modal, SafeAreaView 
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

const translations = {
  en: {
    headerTitle: "Mindfulness Assistant",
    logoutBtn: "Logout",
    chatHeader: "Mindfulness Virtual Assistant",
    chatBody: "[ AI Chatbot Code Injection Point ]",
    card1Title: "About the Assistant",
    card1Text: "Our AI is trained to guide you through mindfulness exercises.",
    card2Title: "Usage Instructions",
    card2Text: "Find a quiet space and follow the breathing prompts.",
    card3Title: "Recent Updates",
    card3Text: "We improved the Korean processing features recently.",
    card4Title: "Quick Settings",
    card4Text: "Customize your interface and accessibility options here.",
    supportBtn: "Support Ticket"
  },
  ko: {
    headerTitle: "명상 보조 도구",
    logoutBtn: "로그아웃",
    chatHeader: "명상 가상 비서",
    chatBody: "[ AI 챗봇 코드 삽입 지점 ]",
    card1Title: "비서 정보",
    card1Text: "저희 AI는 명상 연습을 안내하도록 교육되었습니다.",
    card2Title: "사용 지침",
    card2Text: "조용한 장소를 찾고 호흡 안내를 따르십시오.",
    card3Title: "최신 업데이트",
    card3Text: "최근 한국어 처리 기능을 개선했습니다.",
    card4Title: "빠른 설정",
    card4Text: "여기에서 인터페이스와 접근성 설정을 사용자 정의하십시오.",
    supportBtn: "지원 티켓"
  }
};

export default function HomeScreen() {
  const [lang, setLang] = useState('en');
  const [modalVisible, setModalVisible] = useState(true);

  const t = translations[lang];

  return (
    <SafeAreaView style={styles.container}>
      {/* Language Selection Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Language / 언어</Text>
            <Picker
              selectedValue={lang}
              onValueChange={(itemValue) => setLang(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="English" value="en" />
              <Picker.Item label="한국어 (Korean)" value="ko" />
            </Picker>
            <TouchableOpacity 
              style={styles.startBtn} 
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.startBtnText}>Start</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.langContainer}>
          <Text>🌐</Text>
          <Picker
            selectedValue={lang}
            onValueChange={(val) => setLang(val)}
            style={styles.headerPicker}
          >
            <Picker.Item label="EN" value="en" />
            <Picker.Item label="KO" value="ko" />
          </Picker>
        </View>
        <Text style={styles.headerTitle}>{t.headerTitle}</Text>
        <TouchableOpacity>
          <Text style={styles.logoutText}>{t.logoutBtn}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Chat Placeholder */}
        <View style={styles.chatPlaceholder}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatHeaderText}>{t.chatHeader}</Text>
          </View>
          <View style={styles.chatBody}>
            <Text style={styles.chatBodyText}>{t.chatBody}</Text>
          </View>
        </View>

        {/* Grid Cards */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.card1Title}</Text>
          <Text style={styles.cardText}>{t.card1Text}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.card2Title}</Text>
          <Text style={styles.cardText}>{t.card2Text}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.card3Title}</Text>
          <Text style={styles.cardText}>{t.card3Text}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.card4Title}</Text>
          <Text style={styles.cardText}>{t.card4Text}</Text>
        </View>

        {/* Support Button */}
        <TouchableOpacity style={styles.supportBtn}>
          <Text style={styles.supportBtnText}>{t.supportBtn}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: {
    backgroundColor: '#1f3c88',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  logoutText: { color: 'white', fontWeight: 'bold' },
  langContainer: { flexDirection: 'row', alignItems: 'center', width: 80 },
  headerPicker: { width: 100, color: 'white' },
  scrollBody: { padding: 20 },
  chatPlaceholder: {
    backgroundColor: 'white',
    height: 300,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1f3c88',
    borderStyle: 'dashed',
    marginBottom: 20,
    overflow: 'hidden'
  },
  chatHeader: { backgroundColor: '#e8edf7', padding: 10, alignItems: 'center' },
  chatHeaderText: { color: '#1f3c88', fontWeight: 'bold' },
  chatBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatBodyText: { color: '#999', fontStyle: 'italic' },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    borderTopWidth: 4,
    borderTopColor: '#1f3c88',
    marginBottom: 15,
    elevation: 3, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f3c88', marginBottom: 5 },
  cardText: { color: '#555', lineHeight: 22 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 15,
    width: '80%'
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  picker: { marginVertical: 20 },
  startBtn: { backgroundColor: '#1f3c88', padding: 15, borderRadius: 8 },
  startBtnText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  supportBtn: { backgroundColor: '#2ecc71', padding: 15, borderRadius: 8, marginTop: 10 },
  supportBtnText: { color: 'white', textAlign: 'center', fontWeight: 'bold' }
});